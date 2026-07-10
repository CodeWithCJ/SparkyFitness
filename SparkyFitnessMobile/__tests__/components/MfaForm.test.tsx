import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MfaForm from '../../src/components/MfaForm';

describe('MfaForm', () => {
  it('accepts Arabic verification digits without replacing the typed script', () => {
    const onMfaCodeChange = jest.fn();
    const screen = render(
      <MfaForm
        mfaFactors={{ mfaTotpEnabled: true, mfaEmailEnabled: false }}
        mfaMethod="totp"
        onMfaMethodChange={jest.fn()}
        mfaCode=""
        onMfaCodeChange={onMfaCodeChange}
        emailOtpSent={false}
        error=""
        loading={false}
        onVerify={jest.fn()}
        onSendEmailOtp={jest.fn()}
        onBack={jest.fn()}
        textMuted="#6b7280"
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText('٠٠٠٠٠٠'), '١٢٣٤٥٦');

    expect(onMfaCodeChange).toHaveBeenCalledWith('١٢٣٤٥٦');
  });
});
