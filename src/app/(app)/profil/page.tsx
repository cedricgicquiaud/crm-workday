import { ProfileForm } from "@/features/profile/profile-form";
import { ThemePreference } from "@/features/theme/theme-preference";

/** Mon profil : deux emplacements, remplis par 1.2b (identité, mot de passe) et 1.3 (thème). */
export default function ProfilPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
      <section aria-labelledby="profil-identite" className="grid gap-2">
        <h2 id="profil-identite" className="text-base font-medium">Identité et mot de passe</h2>
        <ProfileForm />
      </section>
      <section aria-labelledby="profil-theme" className="grid gap-2">
        <h2 id="profil-theme" className="text-base font-medium">Thème</h2>
        <ThemePreference />
      </section>
    </div>
  );
}
