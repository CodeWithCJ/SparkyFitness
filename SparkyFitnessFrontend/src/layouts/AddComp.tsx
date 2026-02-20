import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AddCompItem {
  value: string;
  label: string;
  icon: LucideIcon;
  fullWidth?: boolean;
}

interface AddCompProps {
  isVisible: boolean;
  onClose: () => void;
  items: AddCompItem[];
  onNavigate: (value: string) => void;
  title?: string;
}

const AddComp: React.FC<AddCompProps> = ({
  isVisible,
  onClose,
  items,
  onNavigate,
  title,
}) => {
  const { t } = useTranslation();

  if (!isVisible) {
    return null;
  }

  const handleItemClick = (value: string) => {
    onNavigate(value);
    onClose();
  };

  // Full width support
  const regularItems = items.filter((item) => !item.fullWidth);
  const fullWidthItems = items.filter((item) => item.fullWidth);

  return (
    <div
      className="fixed inset-0 z-40 bg-black bg-opacity-30 flex items-end justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-background rounded-t-3xl max-h-[70vh] sm:max-h-[500px] overflow-y-auto shadow-2xl border-t-4 border-primary/50 dark:border-primary/70 backdrop-filter backdrop-blur-lg bg-opacity-70 dark:bg-opacity-70 pointer-events-auto p-6 pb-20 sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/70 hover:text-foreground text-xl font-bold p-2 rounded-full hover:bg-muted-foreground/10 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="text-2xl font-bold text-foreground mb-4 text-center mt-2">
          {title || t('addComp.addNew', 'Add New')}
        </h2>

        {/* Regular grid items */}
        {regularItems.length > 0 && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {regularItems.map((item) => (
              <Button
                key={item.value}
                variant="outline"
                className="flex flex-col items-center justify-center h-24 text-center bg-card text-card-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                onClick={() => handleItemClick(item.value)}
              >
                <item.icon className="h-6 w-6 mb-1" />
                <span className="text-sm font-semibold">{item.label}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Full-width items */}
        {fullWidthItems.length > 0 && (
          <div className="flex flex-col gap-3 mt-4">
            {fullWidthItems.map((item) => (
              <Button
                key={item.value}
                variant="outline"
                className="flex items-center justify-center h-16 w-full text-center bg-card text-card-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                onClick={() => handleItemClick(item.value)}
              >
                <item.icon className="h-6 w-6 mr-2" />
                <span className="text-base font-semibold">{item.label}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddComp;
