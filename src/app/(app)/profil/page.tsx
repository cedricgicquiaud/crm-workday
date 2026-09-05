import { ProfileForm } from "@/features/profile/profile-form";
import { isTheme } from "@/features/theme/theme";
import { ThemePreference } from "@/features/theme/theme-preference";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Mon profil : identité et mot de passe (1.2b), thème (1.3) (D13). */
export default async function ProfilPage() {
  const { user } = await requireSession();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
      {/* 8 px ici + 8 px de `pt-2` dans `ProfileForm` : 16 px entre le titre et le premier libellé, comme pour le thème. */}
      <section aria-labelledby="profil-identite" className="grid gap-2">
        <h2 id="profil-identite" className="text-base font-medium">Identité et mot de passe</h2>
        <ProfileForm />
      </section>
      <section aria-labelledby="profil-theme" className="grid gap-4">
        <h2 id="profil-theme" className="text-base font-medium">Thème</h2>
        <ThemePreference initial={isTheme(user.theme) ? user.theme : "systeme"} />
      </section>
    </div>
  );
}
