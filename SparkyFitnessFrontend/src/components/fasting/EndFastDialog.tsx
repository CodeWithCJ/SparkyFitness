import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from "react-i18next";

interface EndFastDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onEnd: (weight?: number, mood?: { value: number; notes: string }) => void;
    durationFormatted: string;
}

const EndFastDialog: React.FC<EndFastDialogProps> = ({ isOpen, onClose, onEnd, durationFormatted }) => {
    const { t } = useTranslation();

    const handleConfirm = () => {
        onEnd();
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Fast Completed! 🎉</DialogTitle>
                    <DialogDescription>
                        You fasted for <span className="font-bold text-primary">{durationFormatted}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 text-center space-y-2">
                    <p className="text-muted-foreground">
                        Great job! Don't forget to log your <strong>Weight</strong> and <strong>Mood</strong> in the daily check-in below.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleConfirm}>End Fast</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default EndFastDialog;
