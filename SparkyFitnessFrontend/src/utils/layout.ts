export const getGridClass = (cols: number) => {
  switch (cols) {
    case 1:
      return 'sm:grid-cols-1';
    case 2:
      return 'sm:grid-cols-2';
    case 3:
      return 'sm:grid-cols-3';
    case 4:
      return 'sm:grid-cols-4';
    case 5:
      return 'sm:grid-cols-5';
    case 6:
      return 'sm:grid-cols-6';
    case 7:
      return 'sm:grid-cols-7';
    case 8:
      return 'sm:grid-cols-8';
    default:
      return 'sm:grid-cols-7';
  }
};
