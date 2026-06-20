import AuthenticationSettings from './AuthenticationSettings';
import BackupSettings from './BackupSettings';
import OidcSettings from './OidcSettings';
import UserManagement from './UserManagement';
import GlobalAISettings from './GlobalAISettings';
import GlobalProviderSettings from './GlobalProviderSettings';

const AdminPage = () => {
  return (
    <div className="flex flex-col space-y-4">
      <AuthenticationSettings />
      <OidcSettings />
      <GlobalAISettings />
      <GlobalProviderSettings />
      <BackupSettings />
      <UserManagement />
    </div>
  );
};

export default AdminPage;
