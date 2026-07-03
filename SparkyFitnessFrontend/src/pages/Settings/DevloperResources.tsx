import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'; // Import Accordion components
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const DeveloperResources = () => {
  const { t } = useTranslation();
  return (
    <AccordionItem
      value="developer-resources"
      className="border rounded-lg mb-4"
    >
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.developerResources.description',
          'Access API documentation and resources'
        )}
      >
        <BookOpen className="h-5 w-5" />
        {t('settings.developerResources.title', 'Developer Resources')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        <div className="grid gap-4">
          <div className="flex flex-col space-y-2">
            <h4 className="font-medium">API Documentation</h4>
            <p className="text-sm text-muted-foreground">
              Explore the SparkyFitness API documentation to build integrations
              or understand the platform better.
            </p>
            <div className="flex gap-4 mt-2">
              <Button variant="outline" asChild>
                <a
                  href="/api/api-docs/swagger"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Swagger UI (Interactive)
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a
                  href="/api/api-docs/redoc"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Redoc (Read-only)
                </a>
              </Button>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
