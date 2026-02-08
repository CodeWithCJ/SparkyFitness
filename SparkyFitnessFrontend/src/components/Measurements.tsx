
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import CustomMeasurements from "./CustomMeasurements";

const Measurements = () => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();

  if (!user || !activeUserId) {
    return <div>Please sign in to view your measurements.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">Measurements Tracking</h2>
        <p className="text-muted-foreground mb-6">
          Track your custom measurements. To manage your measurement categories, go to Settings.
        </p>
      </div>

      <CustomMeasurements />
    </div>
  );
};

export default Measurements;
