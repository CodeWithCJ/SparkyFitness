import React from "react";
import { useTranslation } from "react-i18next";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddCompItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface AddCompProps {
  isVisible: boolean;
  onClose: () => void;
  items: AddCompItem[];
  onNavigate: (value: string) => void;
}

const AddComp: React.FC<AddCompProps> = ({
  isVisible,
  onClose,
  items,
  onNavigate,
}) => {
  const { t } = useTranslation();

  if (!isVisible) {
    return null;
  }

  const handleItemClick = (value: string) => {
    onNavigate(value);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black bg-opacity-30 flex items-end justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-background rounded-t-3xl h-1/2 sm:h-72 overflow-hidden shadow-2xl border-t-4 border-primary/50 dark:border-primary/70 backdrop-filter backdrop-blur-lg bg-opacity-70 dark:bg-opacity-70 pointer-events-auto p-6"
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
          {t("addComp.addNew", "Add New")}
        </h2>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {items.map((item) => (
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
      </div>
    </div>
  );
};

export default AddComp;
