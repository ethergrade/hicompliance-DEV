import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationLocations } from "@/hooks/useOrganizationLocations";
import { LocationForm } from "./LocationForm";
import { LocationItem } from "./LocationItem";
import { MapPin, Plus } from "lucide-react";
import { OrganizationLocation } from "@/types/organization";

export function LocationManager() {
  const { locations, loading, createLocation, updateLocation, deleteLocation } = useOrganizationLocations();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<OrganizationLocation | null>(null);

  const handleCreateLocation = async (locationData: Partial<OrganizationLocation>) => {
    const success = await createLocation(locationData);
    if (success) {
      setIsFormOpen(false);
    }
  };

  const handleUpdateLocation = async (id: string, locationData: Partial<OrganizationLocation>) => {
    const success = await updateLocation(id, locationData);
    if (success) {
      setEditingLocation(null);
    }
  };

  const handleEditLocation = (location: OrganizationLocation) => {
    setEditingLocation(location);
  };

  const handleDeleteLocation = async (id: string) => {
    await deleteLocation(id);
  };

  if (loading) {
    return <div>Caricamento sedi...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Sedi Organizzazione
            </CardTitle>
            <CardDescription>
              Gestisci le sedi della tua organizzazione
            </CardDescription>
          </div>
          <Button onClick={() => setIsFormOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Aggiungi Sede
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form per nuova sede */}
        {isFormOpen && (
          <LocationForm
            onSubmit={handleCreateLocation}
            onCancel={() => setIsFormOpen(false)}
          />
        )}

        {/* Form per modifica sede */}
        {editingLocation && (
          <LocationForm
            location={editingLocation}
            onSubmit={(data) => handleUpdateLocation(editingLocation.id, data)}
            onCancel={() => setEditingLocation(null)}
          />
        )}

        {/* Lista sedi */}
        <div className="space-y-3">
          {locations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessuna sede configurata</p>
              <p className="text-sm">Aggiungi la prima sede della tua organizzazione</p>
            </div>
          ) : (
            locations.map((location) => (
              <LocationItem
                key={location.id}
                location={location}
                onEdit={handleEditLocation}
                onDelete={handleDeleteLocation}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}