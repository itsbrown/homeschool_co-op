import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ClipboardCheck } from 'lucide-react';
import ProgressLogForm from './ProgressLogForm';

type Props = {
  childId: number;
  childName: string;
};

export default function ProgressQuickLogDialog({ childId, childName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-log-progress">
          <ClipboardCheck className="h-4 w-4 mr-2" />
          Log progress
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-log-progress">
        <DialogHeader>
          <DialogTitle>Log progress for {childName}</DialogTitle>
        </DialogHeader>
        <ProgressLogForm
          fixedChildId={childId}
          fixedChildName={childName}
          compact
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
