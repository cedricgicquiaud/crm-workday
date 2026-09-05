/**
 * Seul cas que le serveur ne peut pas trancher : thème « système » (ou aucune session), où la
 * classe suit la préférence du navigateur. Pour un utilisateur en clair ou sombre, la classe
 * vient du serveur et ce script ne fait rien (contrat 26). Aucune dépendance, exécuté avant tout rendu.
 */
const SCRIPT = `(function(){var h=document.documentElement;if(h.dataset.theme!=="systeme")return;if(window.matchMedia("(prefers-color-scheme: dark)").matches)h.classList.add("dark")})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
