import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter as Router } from 'react-router-dom';
import MealPlanCalendar from '../../components/MealPlanCalendar';

describe('MealPlanCalendar', () => {
  it('renders the MealPlanCalendar component', () => {
    render(
      <Router>
        <MealPlanCalendar />
      </Router>
    );
    expect(screen.getByText('Meal Plan')).toBeInTheDocument();
  });
});