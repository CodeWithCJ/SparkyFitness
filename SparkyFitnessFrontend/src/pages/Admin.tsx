import AuthenticationSettings from "./Admin/AuthenticationSettings";
import BackupSettings from "./Admin/BackupSettings";
import UserManagement from "./Admin/UserManagement";

const AdminPage = () => {
  return (
    <div className="flex flex-col space-y-4">
      <AuthenticationSettings />
      <BackupSettings />
      <UserManagement />
    </div>
  );
};

export default AdminPage;
