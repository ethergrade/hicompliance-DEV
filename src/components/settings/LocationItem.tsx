import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Phone, Mail, Edit, Trash2, Star } from "lucide-react";
import { OrganizationLocation } from "@/types/organization";

interface LocationItemProps {
  location: OrganizationLocation;
  onEdit: (location: OrganizationLocation) => void;
  onDelete: (id: string) => void;
}

export function LocationItem({ location, onEdit, onDelete }: LocationItemProps) {
  const handleDelete = () => {
    if (window.confirm("Sei sicuro di voler eliminare questa sede?")) {
      onDelete(location.id);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {location.name}
                {location.is_main_location && (
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                )}
              </h3>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>{location.address}</p>
              <p>
                {location.city}
                {location.postal_code && `, ${location.postal_code}`}
                {location.country && `, ${location.country}`}
              </p>

              {location.phone && (
                <p className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {location.phone}
                </p>
              )}

              {location.email && (
                <p className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {location.email}
                </p>
              )}

              {location.notes && (
                <p className="text-xs italic">{location.notes}</p>
              )}
            </div>

            {location.tags && location.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {location.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(location)}
              className="flex items-center gap-1"
            >
              <Edit className="h-3 w-3" />
              Modifica
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="flex items-center gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Elimina
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}