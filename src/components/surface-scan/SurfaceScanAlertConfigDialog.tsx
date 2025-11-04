import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';

const alertFormSchema = z.object({
  alert_email: z
    .string()
    .trim()
    .email({ message: 'Email non valida' })
    .max(255, { message: 'Email troppo lunga' }),
  alert_types: z.object({
    vulnerabilita_critiche: z.boolean(),
    vulnerabilita_alte: z.boolean(),
    porte_esposte: z.boolean(),
    certificati_scaduti: z.boolean(),
    servizi_non_sicuri: z.boolean(),
  }).refine(
    (data) => Object.values(data).some((v) => v === true),
    { message: 'Seleziona almeno un tipo di alert' }
  ),
});

type AlertFormValues = z.infer<typeof alertFormSchema>;

interface SurfaceScanAlertConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { alert_email: string; alert_types: SurfaceScanAlertTypes }) => Promise<boolean>;
  defaultValues?: AlertFormValues;
  mode?: 'create' | 'edit';
}

const alertTypeLabels = {
  vulnerabilita_critiche: 'Vulnerabilità Critiche',
  vulnerabilita_alte: 'Vulnerabilità Alte',
  porte_esposte: 'Porte Esposte',
  certificati_scaduti: 'Certificati Scaduti',
  servizi_non_sicuri: 'Servizi Non Sicuri',
};

export const SurfaceScanAlertConfigDialog: React.FC<SurfaceScanAlertConfigDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  mode = 'create',
}) => {
  const form = useForm<AlertFormValues>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: defaultValues || {
      alert_email: '',
      alert_types: {
        vulnerabilita_critiche: false,
        vulnerabilita_alte: false,
        porte_esposte: false,
        certificati_scaduti: false,
        servizi_non_sicuri: false,
      },
    },
  });

  const handleSubmit = async (data: AlertFormValues) => {
    const submitData: { alert_email: string; alert_types: SurfaceScanAlertTypes } = {
      alert_email: data.alert_email,
      alert_types: {
        vulnerabilita_critiche: data.alert_types.vulnerabilita_critiche,
        vulnerabilita_alte: data.alert_types.vulnerabilita_alte,
        porte_esposte: data.alert_types.porte_esposte,
        certificati_scaduti: data.alert_types.certificati_scaduti,
        servizi_non_sicuri: data.alert_types.servizi_non_sicuri,
      },
    };
    const success = await onSubmit(submitData);
    if (success) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Configura Nuovo Alert' : 'Modifica Alert'}
          </DialogTitle>
          <DialogDescription>
            Seleziona i tipi di vulnerabilità da monitorare e l'email per ricevere le notifiche
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="alert_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Destinatario</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="esempio@dominio.it"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormLabel>Tipi di Alert</FormLabel>
              {Object.entries(alertTypeLabels).map(([key, label]) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={`alert_types.${key as keyof SurfaceScanAlertTypes}`}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-normal cursor-pointer">
                          {label}
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
              {form.formState.errors.alert_types && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.alert_types.message}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? 'Salvataggio...'
                  : mode === 'create'
                  ? 'Crea Alert'
                  : 'Salva Modifiche'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
