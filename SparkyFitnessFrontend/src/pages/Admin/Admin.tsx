import AuthenticationSettings from "./AuthenticationSettings";
import BackupSettings from "./BackupSettings";
import UserManagement from "./UserManagement";

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
