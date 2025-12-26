if RUBY_ENGINE == 'jruby'
  JRuby::Util.load_ext("org.jruby.ext.bigdecimal.BigDecimalLibrary")

  class BigDecimal
    def _decimal_shift(i) # :nodoc:
      to_java.move_point_right(i).to_d
    end
  end
else
  require 'bigdecimal.so'
end

class BigDecimal
  module Internal # :nodoc:

    # Coerce x to BigDecimal with the specified precision.
    # TODO: some methods (example: BigMath.exp) require more precision than specified to coerce.
    def self.coerce_to_bigdecimal(x, prec, method_name) # :nodoc:
      case x
      when BigDecimal
        return x
      when Integer, Float
        return BigDecimal(x, 0)
      when Rational
        return BigDecimal(x, [prec, 2 * BigDecimal.double_fig].max)
      end
      raise ArgumentError, "#{x.inspect} can't be coerced into BigDecimal"
    end

    def self.coerce_validate_prec(prec, method_name, accept_zero: false) # :nodoc:
      unless Integer === prec
        original = prec
        # Emulate Integer.try_convert for ruby < 3.1
        if prec.respond_to?(:to_int)
          prec = prec.to_int
        else
          raise TypeError, "no implicit conversion of #{original.class} into Integer"
        end
        raise TypeError, "can't convert #{original.class} to Integer" unless Integer === prec
      end

      if accept_zero
        raise ArgumentError, "Negative precision for #{method_name}" if prec < 0
      else
        raise ArgumentError, "Zero or negative precision for #{method_name}" if prec <= 0
      end
      prec
    end

    def self.infinity_computation_result # :nodoc:
      if BigDecimal.mode(BigDecimal::EXCEPTION_ALL).anybits?(BigDecimal::EXCEPTION_INFINITY)
        raise FloatDomainError, "Computation results in 'Infinity'"
      end
      BigDecimal::INFINITY
    end

    def self.nan_computation_result # :nodoc:
      if BigDecimal.mode(BigDecimal::EXCEPTION_ALL).anybits?(BigDecimal::EXCEPTION_NaN)
        raise FloatDomainError, "Computation results to 'NaN'"
      end
      BigDecimal::NAN
    end
  end

  #  call-seq:
  #    self ** other -> bigdecimal
  #
  #  Returns the \BigDecimal value of +self+ raised to power +other+:
  #
  #    b = BigDecimal('3.14')
  #    b ** 2              # => 0.98596e1
  #    b ** 2.0            # => 0.98596e1
  #    b ** Rational(2, 1) # => 0.98596e1
  #
  #  Related: BigDecimal#power.
  #
  def **(y)
    case y
    when BigDecimal, Integer, Float, Rational
      power(y)
    when nil
      raise TypeError, 'wrong argument type NilClass'
    else
      x, y = y.coerce(self)
      x**y
    end
  end

  # call-seq:
  #   power(n)
  #   power(n, prec)
  #
  # Returns the value raised to the power of n.
  #
  # Also available as the operator **.
  #
  def power(y, prec = 0)
    prec = Internal.coerce_validate_prec(prec, :power, accept_zero: true)
    x = self
    y = Internal.coerce_to_bigdecimal(y, prec.nonzero? || n_significant_digits, :power)

    return Internal.nan_computation_result if x.nan? || y.nan?
    return BigDecimal(1) if y.zero?

    if y.infinite?
      if x < 0
        return BigDecimal(0) if x < -1 && y.negative?
        return BigDecimal(0) if x > -1 && y.positive?
        raise Math::DomainError, 'Result undefined for negative base raised to infinite power'
      elsif x < 1
        return y.positive? ? BigDecimal(0) : BigDecimal::Internal.infinity_computation_result
      elsif x == 1
        return BigDecimal(1)
      else
        return y.positive? ? BigDecimal::Internal.infinity_computation_result : BigDecimal(0)
      end
    end

    if x.infinite? && y < 0
      # Computation result will be +0 or -0. Avoid overflow.
      neg = x < 0 && y.frac.zero? && y % 2 == 1
      return neg ? -BigDecimal(0) : BigDecimal(0)
    end

    if x.zero?
      return BigDecimal(1) if y.zero?
      return BigDecimal(0) if y > 0
      if y.frac.zero? && y % 2 == 1 && x.sign == -1
        return -BigDecimal::Internal.infinity_computation_result
      else
        return BigDecimal::Internal.infinity_computation_result
      end
    elsif x < 0
      if y.frac.zero?
        if y % 2 == 0
          return (-x).power(y, prec)
        else
          return -(-x).power(y, prec)
        end
      else
        raise Math::DomainError, 'Computation results in complex number'
      end
    elsif x == 1
      return BigDecimal(1)
    end

    limit = BigDecimal.limit
    frac_part = y.frac

    if frac_part.zero? && prec.zero? && limit.zero?
      # Infinite precision calculation for `x ** int` and `x.power(int)`
      int_part = y.fix.to_i
      int_part = -int_part if (neg = int_part < 0)
      ans = BigDecimal(1)
      n = 1
      xn = x
      while true
        ans *= xn if int_part.allbits?(n)
        n <<= 1
        break if n > int_part
        xn *= xn
        # Detect overflow/underflow before consuming infinite memory
        if (xn.exponent.abs - 1) * int_part / n >= 0x7FFFFFFFFFFFFFFF
          return ((xn.exponent > 0) ^ neg ? BigDecimal::Internal.infinity_computation_result : BigDecimal(0)) * (int_part.even? || x > 0 ? 1 : -1)
        end
      end
      return neg ? BigDecimal(1) / ans : ans
    end

    result_prec = prec.nonzero? || [x.n_significant_digits, y.n_significant_digits, BigDecimal.double_fig].max + BigDecimal.double_fig
    result_prec = [result_prec, limit].min if prec.zero? && limit.nonzero?

    prec2 = result_prec + BigDecimal.double_fig

    if y < 0
      inv = x.power(-y, prec2)
      return BigDecimal(0) if inv.infinite?
      return BigDecimal::Internal.infinity_computation_result if inv.zero?
      return BigDecimal(1).div(inv, result_prec)
    end

    if frac_part.zero? && y.exponent < Math.log(result_prec) * 5 + 20
      # Use exponentiation by squaring if y is an integer and not too large
      pow_prec = prec2 + y.exponent
      n = 1
      xn = x
      ans = BigDecimal(1)
      int_part = y.fix.to_i
      while true
        ans = ans.mult(xn, pow_prec) if int_part.allbits?(n)
        n <<= 1
        break if n > int_part
        xn = xn.mult(xn, pow_prec)
      end
      ans.mult(1, result_prec)
    else
      if x > 1 && x.finite?
        # To calculate exp(z, prec), z needs prec+max(z.exponent, 0) precision if z > 0.
        # Estimate (y*log(x)).exponent
        logx_exponent = x < 2 ? (x - 1).exponent : Math.log10(x.exponent).round
        ylogx_exponent = y.exponent + logx_exponent
        prec2 += [ylogx_exponent, 0].max
      end
      BigMath.exp(BigMath.log(x, prec2).mult(y, prec2), result_prec)
    end
  end

  # Returns the square root of the value.
  #
  # Result has at least prec significant digits.
  #
  def sqrt(prec)
    prec = Internal.coerce_validate_prec(prec, :sqrt, accept_zero: true)
    return Internal.infinity_computation_result if infinite? == 1

    raise FloatDomainError, 'sqrt of negative value' if self < 0
    raise FloatDomainError, "sqrt of 'NaN'(Not a Number)" if nan?
    return self if zero?

    if prec == 0
      limit = BigDecimal.limit
      prec = n_significant_digits + BigDecimal.double_fig
      prec = [limit, prec].min if limit.nonzero?
    end

    ex = exponent / 2
    x = _decimal_shift(-2 * ex)
    y = BigDecimal(Math.sqrt(x.to_f), 0)
    precs = [prec + BigDecimal.double_fig]
    precs << 2 + precs.last / 2 while precs.last > BigDecimal.double_fig
    precs.reverse_each do |p|
      y = y.add(x.div(y, p), p).div(2, p)
    end
    y._decimal_shift(ex).mult(1, prec)
  end
end

# Core BigMath methods for BigDecimal (log, exp) are defined here.
# Other methods (sin, cos, atan) are defined in 'bigdecimal/math.rb'.
module BigMath
  module_function

  # call-seq:
  #   BigMath.log(decimal, numeric)    -> BigDecimal
  #
  # Computes the natural logarithm of +decimal+ to the specified number of
  # digits of precision, +numeric+.
  #
  # If +decimal+ is zero or negative, raises Math::DomainError.
  #
  # If +decimal+ is positive infinity, returns Infinity.
  #
  # If +decimal+ is NaN, returns NaN.
  #
  def log(x, prec)
    prec = BigDecimal::Internal.coerce_validate_prec(prec, :log)
    raise Math::DomainError, 'Complex argument for BigMath.log' if Complex === x

    x = BigDecimal::Internal.coerce_to_bigdecimal(x, prec, :log)
    return BigDecimal::Internal.nan_computation_result if x.nan?
    raise Math::DomainError, 'Negative argument for log' if x < 0
    return -BigDecimal::Internal.infinity_computation_result if x.zero?
    return BigDecimal::Internal.infinity_computation_result if x.infinite?
    return BigDecimal(0) if x == 1

    prec2 = prec + BigDecimal.double_fig
    BigDecimal.save_limit do
      BigDecimal.limit(0)
      if x > 10 || x < 0.1
        log10 = log(BigDecimal(10), prec2)
        exponent = x.exponent
        x = x._decimal_shift(-exponent)
        if x < 0.3
          x *= 10
          exponent -= 1
        end
        return (log10 * exponent).add(log(x, prec2), prec)
      end

      x_minus_one_exponent = (x - 1).exponent

      # log(x) = log(sqrt(sqrt(sqrt(sqrt(x))))) * 2**sqrt_steps
      sqrt_steps = [Integer.sqrt(prec2) + 3 * x_minus_one_exponent, 0].max

      lg2 = 0.3010299956639812
      sqrt_prec = prec2 + [-x_minus_one_exponent, 0].max + (sqrt_steps * lg2).ceil

      sqrt_steps.times do
        x = x.sqrt(sqrt_prec)
      end

      # Taylor series for log(x) around 1
      # log(x) = -log((1 + X) / (1 - X)) where X = (x - 1) / (x + 1)
      # log(x) = 2 * (X + X**3 / 3 + X**5 / 5 + X**7 / 7 + ...)
      x = (x - 1).div(x + 1, sqrt_prec)
      y = x
      x2 = x.mult(x, prec2)
      1.step do |i|
        n = prec2 + x.exponent - y.exponent + x2.exponent
        break if n <= 0 || x.zero?
        x = x.mult(x2.round(n - x2.exponent), n)
        y = y.add(x.div(2 * i + 1, n), prec2)
      end

      y.mult(2 ** (sqrt_steps + 1), prec)
    end
  end

  # Taylor series for exp(x) around 0
  private_class_method def _exp_taylor(x, prec) # :nodoc:
    xn = BigDecimal(1)
    y = BigDecimal(1)
    1.step do |i|
      n = prec + xn.exponent
      break if n <= 0 || xn.zero?
      xn = xn.mult(x, n).div(i, n)
      y = y.add(xn, prec)
    end
    y
  end

  # call-seq:
  #   BigMath.exp(decimal, numeric)    -> BigDecimal
  #
  # Computes the value of e (the base of natural logarithms) raised to the
  # power of +decimal+, to the specified number of digits of precision.
  #
  # If +decimal+ is infinity, returns Infinity.
  #
  # If +decimal+ is NaN, returns NaN.
  #
  def exp(x, prec)
    prec = BigDecimal::Internal.coerce_validate_prec(prec, :exp)
    x = BigDecimal::Internal.coerce_to_bigdecimal(x, prec, :exp)
    return BigDecimal::Internal.nan_computation_result if x.nan?
    return x.positive? ? BigDecimal::Internal.infinity_computation_result : BigDecimal(0) if x.infinite?
    return BigDecimal(1) if x.zero?

    # exp(x * 10**cnt) = exp(x)**(10**cnt)
    cnt = x < -1 || x > 1 ? x.exponent : 0
    prec2 = prec + BigDecimal.double_fig + cnt
    x = x._decimal_shift(-cnt)

    # Calculation of exp(small_prec) is fast because calculation of x**n is fast
    # Calculation of exp(small_abs) converges fast.
    # exp(x) = exp(small_prec_part + small_abs_part) = exp(small_prec_part) * exp(small_abs_part)
    x_small_prec = x.round(Integer.sqrt(prec2))
    y = _exp_taylor(x_small_prec, prec2).mult(_exp_taylor(x.sub(x_small_prec, prec2), prec2), prec2)

    # calculate exp(x * 10**cnt) from exp(x)
    # exp(x * 10**k) = exp(x * 10**(k - 1)) ** 10
    cnt.times do
      y2 = y.mult(y, prec2)
      y5 = y2.mult(y2, prec2).mult(y, prec2)
      y = y5.mult(y5, prec2)
    end

    y.mult(1, prec)
  end
end
