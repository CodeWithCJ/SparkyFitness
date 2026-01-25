// Manual mock for uuid to avoid ES module issues in Jest
let mockCounter = 0;

const v4 = jest.fn(() => {
  mockCounter++;
  return `00000000-0000-0000-0000-${String(mockCounter).padStart(12, '0')}`;
});

module.exports = {
  v4,
};
