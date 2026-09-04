import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Page de connexion. Le formulaire est branché par la livraison 1.2a. */
export default function ConnexionPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Connexion</h1>
        <CardDescription>CRM Workday — accès réservé à l&apos;équipe du cabinet.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" aria-label="Formulaire de connexion">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" disabled title="La connexion arrive avec la livraison 1.2a">
            Se connecter
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
