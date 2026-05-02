import { Button } from '@/components/ui/button';
import { useDownloadDiaryExport } from '@/hooks/Diary/useFoodEntries';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2 } from 'lucide-react';

export const DataManagementSettings = () => {
  const { toast } = useToast();
  const { mutateAsync: exportDiary, isPending: isExporting } =
    useDownloadDiaryExport();

  const handleExportDiary = async () => {
    try {
      const blob = await exportDiary();

      // Create a link to download the blob
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sparkyfitness_diary_export.csv');
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export réussi',
        description: 'Votre journal a été exporté avec succès.',
      });
    } catch (error) {
      console.error('Error exporting diary:', error);
      toast({
        title: "Erreur d'export",
        description:
          'Impossible de télécharger votre journal. Veuillez réessayer plus tard.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">Exportation des données</h3>
        <p className="text-sm text-muted-foreground">
          Téléchargez l'intégralité de votre journal alimentaire au format CSV.
          Le fichier contiendra tous vos repas avec le détail des aliments, des
          portions et des macros (calories, protéines, glucides, lipides...).
        </p>
        <div className="mt-4">
          <Button
            onClick={handleExportDiary}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting
              ? 'Préparation en cours...'
              : 'Exporter mon journal (CSV)'}
          </Button>
        </div>
      </div>
    </div>
  );
};
