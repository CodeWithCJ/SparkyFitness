
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

interface NutritionChartProps {
  protein: number;
  carbs: number;
  fat: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
}

const NutritionChart = ({ protein, carbs, fat, proteinGoal, carbsGoal, fatGoal }: NutritionChartProps) => {
  const pieData = [
    { name: 'Protein', value: protein * 4, color: '#3b82f6' },
    { name: 'Carbs', value: carbs * 4, color: '#f97316' },
    { name: 'Fat', value: fat * 9, color: '#eab308' },
  ];

  const barData = [
    { name: 'Protein', current: protein, goal: proteinGoal, color: '#3b82f6' },
    { name: 'Carbs', current: carbs, goal: carbsGoal, color: '#f97316' },
    { name: 'Fat', current: fat, goal: fatGoal, color: '#eab308' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Calorie Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ color: '#E0E0E0' }} />
              <Tooltip formatter={(value) => [`${value} cal`, 'Calories']} contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#E0E0E0' }} itemStyle={{ color: '#E0E0E0' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Macro Goals Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <XAxis dataKey="name" stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
              <YAxis stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
              <Tooltip formatter={(value, name) => [`${value}g`, name === 'current' ? 'Current' : 'Goal']} contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#E0E0E0' }} itemStyle={{ color: '#E0E0E0' }} />
              <Bar dataKey="current" fill="#22c55e" name="current" />
              <Bar dataKey="goal" fill="#e5e7eb" name="goal" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default NutritionChart;
