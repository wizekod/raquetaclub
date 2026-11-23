import { getProfile } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function JugadorHomePage() {
  const profile = await getProfile();
  const club = await getMyClub();

  if (!club) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Tu cuenta no está ligada a un club</CardTitle>
          <CardDescription>
            Regístrate desde el enlace que te compartió tu club, o pide al administrador que te dé de alta.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Hola, {profile?.first_name ?? "jugador"}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tus partidos</CardTitle>
          <CardDescription>
            Cuando {club.name} publique los grupos de un torneo en el que estés inscrito, aquí verás tus
            rivales, podrás agendar la cancha y subir los resultados.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
