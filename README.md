# Hani Kanaftchian — photographe corporate à Bruxelles

Site vitrine B2B de Hani Kanaftchian, photographe à Bruxelles depuis 2013 (studio Rue Vanderkindere 524,
1180 Uccle). Maquette en ligne : **https://michprk.github.io/kanaftchian.com/** (non indexée tant que
Hani n’a pas validé le site).

## L’idée

**L’intro** : un studio plongé dans le noir. Un appareil photo hybride plein format, modélisé en 3D dans
le code (Three.js, aucun fichier 3D) — boîtier noir, zoom 24-70 mm à bague rouge, « KANAFTCHIAN » gravé
sur le viseur, monogramme HK doré sur la poignée, écran arrière allumé sur un portrait — tourne
lentement sur lui-même. Au bout de 4,6 s (ou au premier geste : molette, glissé, flèche, clic,
bouton déclencheur) il termine son tour pour regarder le visiteur, s’approche, le voyant d’autofocus
s’allume, la bague de mise au point tourne, le diaphragme se ferme… *clac*, **flash** — et le site
« s’allume » : papier chaud, encre noire, or de la marque, sur la photo qui vient d’être prise
(le même portrait que sur l’écran de l’appareil).

- « Passer l’intro » (et Échap) pour aller droit au contenu ; « Revoir le déclic » dans le héros
  et le pied de page.
- L’intro ne se rejoue pas quand on revient d’une page du site pendant la visite, ni quand on arrive
  par un lien vers une section (`/#contact`).
- `?intro=1` force l’intro ; `?intro=hold` la garde à l’écran sans déclenchement automatique
  (pratique pour présenter l’appareil) ; `?intro=0` la saute.

## Pensé pour la conversion (B2B)

- Proposition de valeur en 3 secondes : « La première impression, maîtrisée. » + un seul bouton
  principal **Demander un devis** partout (en-tête, héros, prestations, tarifs, barre mobile).
- Réassurance immédiate : 4,9/5 sur 466 avis Google, 2 000+ clients depuis 2013, devis gratuit ;
  bandeau de références (Gucci, Porsche, Parlement européen, Nations Unies, JCDecaux…) ;
  presse (ONU & JCDecaux, gouvernement suédois, WELT, L’Officiel…).
- Prestations entreprises détaillées avec prix « dès », méthode en 3 étapes, engagements
  (aucun prépaiement, report sans frais jusqu’à 24 h avant), tarifs transparents HTVA,
  avis clients, FAQ, studio d’Uccle et portrait de Hani.
- Formulaire de devis avec **estimation en direct** selon la prestation (grille tarifaire réelle).

Tout le contenu (textes, prix, références, presse, avis, photos) provient du site actuel
kanaftchian.com, consulté le 7 octobre 2026.

## Direction artistique

Papier `#f6f3ec`, encre `#0f0e0c`, nuit `#0c0b0a`, un seul accent : l’or du monogramme `#c9a84c`
(`#7a5d1c` pour le texte sur fond clair, contraste AA). Titres **Manrope** (la police de la marque),
italiques **Instrument Serif**, petites étiquettes en **Inria Serif**. Logo : monogramme HK et
wordmark KANAFTCHIAN repris des fichiers SVG de la marque.

## Fichiers

```
index.html            accueil (intro + toutes les sections)
cgu.html              conditions d’utilisation + mentions légales
confidentialite.html  RGPD + cookies
404.html              page « Cette page est floue » qui retrouve les anciennes adresses
partials/             blocs communs (head, en-tête, pied de page, cookies, icônes)
assets/js/camera3d.js l’appareil photo 3D (Three.js)
assets/js/hero3d.js   chargement de la 3D seulement si l’intro est jouée (repli image fixe sans WebGL)
assets/js/app.js      intro, flash, formulaire, cookies, galerie, compteurs, 404…
assets/js/sound.js    bip d’autofocus et « clac » d’obturateur synthétisés (Web Audio, très discrets)
assets/js/boot.js     script en ligne du <head> (HTTPS, préférences, intro)
api/                  réception du formulaire : contact.php (Hostinger) ou Cloudflare Worker
scripts/              build.sh, check-links.sh, export-hostinger.sh
```

## Après chaque modification

```bash
bash scripts/build.sh        # blocs communs, empreinte CSP, versions ?v=
bash scripts/check-links.sh  # aucun lien ni fichier cassé (--web pour les liens externes)
```

## Mise en ligne sur le domaine

```bash
bash scripts/export-hostinger.sh   # → dist/kanaftchian-hostinger.zip, à extraire dans public_html
```

Le zip retire le « noindex » et les mentions de démonstration, branche le formulaire sur
`api/contact.php` et active les redirections 301 des anciennes adresses du site actuel (`.htaccess`).

## Checklist en place

- **HTTPS forcé** (script de tête + `.htaccess` + HSTS), politique de sécurité stricte (CSP sans
  `unsafe-inline`), anti-iframe, `security.txt`.
- **Bandeau cookies** conforme (refuser aussi simple qu’accepter, préférences modifiables, choix
  redemandé après 6 mois) ; Google Analytics 4 chargé uniquement après accord (`data-ga`).
- **SEO** : titres et descriptions, données structurées (ProfessionalService, offres, FAQ),
  Open Graph + `og.jpg` 1200×630, `sitemap.xml` (avec images), `robots.txt`, canonical.
- **Icônes** : favicon SVG/ICO/PNG, icône iOS, icônes Android (dont « maskable »), manifeste.
- **Images** : WebP compressées (5–80 Ko), `srcset`, chargement différé, dimensions fixées,
  textes alternatifs descriptifs ; portrait du héros préchargé.
- **Vitesse** : polices et scripts hébergés sur le site, Three.js chargé seulement pour l’intro et
  mis en pause après le flash.
- **Contraste & accessibilité** : textes AA, focus visibles, intro pilotable au clavier, lien
  d’évitement, onglets ARIA, bouton « Réduire les animations », lien « Couper le son ».
- **Formulaire validé** (navigateur + serveur), **anti-spam** (champ piège, délai minimal,
  1 envoi/minute, 5 demandes / 10 min / IP côté serveur), sans API : e-mail prérempli.
- **Page 404 personnalisée** + redirections des anciennes adresses.
