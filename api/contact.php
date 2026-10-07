<?php
/**
 * ==========================================================================
 * Hani Kanaftchian — réception du formulaire de devis
 * Pour un hébergement avec PHP (Hostinger, OVH, one.com…).
 *
 * Le site envoie la demande en JSON à /api/contact (réécrit vers ce fichier par
 * le .htaccess). Ce script revérifie tout côté serveur, bloque les robots et
 * envoie la demande par e-mail à Hani. Aucune clé dans le site.
 * ==========================================================================
 */
declare(strict_types=1);

// ---------------------------------------------------------------- Réglages
const DESTINATAIRE = 'hani@kanaftchian.com';    // boîte qui reçoit les demandes
const EXPEDITEUR   = 'site@kanaftchian.com';    // adresse du domaine (Hostinger > E-mails > créer)
const NOM_SITE     = 'Site Hani Kanaftchian';
const LIMITE       = 5;    // demandes maximum par adresse IP…
const FENETRE      = 600;  // …sur 10 minutes
// ---------------------------------------------------------------------------

mb_internal_encoding('UTF-8');
date_default_timezone_set('Europe/Brussels');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function repondre(int $code, array $donnees): void
{
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    repondre(405, ['ok' => false, 'error' => 'Méthode non autorisée.']);
}

// Uniquement depuis le site lui-même
$origine = $_SERVER['HTTP_ORIGIN'] ?? '';
$hote = strtolower((string) preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
if ($origine !== '' && strtolower((string) parse_url($origine, PHP_URL_HOST)) !== $hote) {
    repondre(403, ['ok' => false, 'error' => 'Origine non autorisée.']);
}

$brut = (string) file_get_contents('php://input', false, null, 0, 8192);
$data = json_decode($brut, true);
if (!is_array($data) || ($data['form'] ?? '') !== 'devis') {
    repondre(400, ['ok' => false, 'error' => 'Demande illisible.']);
}

// Anti-spam 1 : champ piège rempli → on répond « OK » sans rien envoyer
if (!empty($data['website'])) {
    repondre(200, ['ok' => true]);
}
// Anti-spam 2 : envoi trop rapide pour un humain
if (!isset($data['elapsed']) || (int) $data['elapsed'] < 3000) {
    repondre(400, ['ok' => false, 'error' => 'Envoi trop rapide. Réessayez dans quelques secondes.']);
}
// Anti-spam 3 : 5 demandes maximum par adresse IP sur 10 minutes
$dossier = __DIR__ . '/.data';
if (!is_dir($dossier)) {
    @mkdir($dossier, 0700, true);
}
$fichier = $dossier . '/' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __FILE__) . '.json';
$maintenant = time();
$essais = is_file($fichier) ? json_decode((string) @file_get_contents($fichier), true) : [];
$essais = array_values(array_filter(is_array($essais) ? $essais : [], function ($t) use ($maintenant) {
    return is_int($t) && $t > $maintenant - FENETRE;
}));
if (count($essais) >= LIMITE) {
    repondre(429, ['ok' => false, 'error' => 'Trop de demandes. Réessayez dans quelques minutes.']);
}
$essais[] = $maintenant;
@file_put_contents($fichier, json_encode($essais), LOCK_EX);

// Listes de choix et libellés (identiques au site)
$choix = [
    'besoin' => ['equipe' => 'Portraits d’équipe', 'portrait' => 'Portrait individuel', 'evenement' => 'Événement d’entreprise', 'immobilier' => 'Immobilier', '360' => 'Visite virtuelle 360°', 'autre' => 'Autre demande'],
    'heures' => ['1' => '1 heure', '2' => '2 heures', '3' => '3 heures', '4' => '4 heures', '5' => '5 heures', '6' => '6 heures', '7' => '7 heures', '8' => 'Journée (8 h)'],
    'biens'  => ['1' => '1 bien', '5' => 'Pack 5 biens', '10' => 'Pack 10 biens', '20' => 'Pack 20 biens'],
    'lieu'   => ['studio' => 'Studio d’Uccle', 'locaux' => 'Dans les locaux du client', 'autre' => 'Autre lieu'],
];
$libelles = ['besoin' => 'Besoin', 'personnes' => 'Nombre de personnes', 'heures' => 'Durée', 'biens' => 'Biens', 'date' => 'Date souhaitée', 'lieu' => 'Lieu', 'estimation' => 'Estimation affichée', 'name' => 'Nom', 'societe' => 'Société', 'email' => 'E-mail', 'phone' => 'Téléphone', 'message' => 'Message'];
$longueurs = ['name' => 80, 'societe' => 80, 'email' => 120, 'phone' => 24, 'message' => 2000];

function ligne($valeur, int $max): string
{
    $v = is_string($valeur) ? $valeur : '';
    $v = (string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v); // aucun saut de ligne : protège les en-têtes
    return mb_substr(trim($v), 0, $max);
}
function texte($valeur, int $max): string
{
    $v = is_string($valeur) ? str_replace("\r\n", "\n", $valeur) : '';
    $v = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v);
    return mb_substr(trim($v), 0, $max);
}

$f = [];
foreach ($libelles as $cle => $libelle) {
    $v = $data[$cle] ?? '';
    if (isset($choix[$cle])) {
        if ((is_string($v) || is_int($v)) && isset($choix[$cle][(string) $v])) {
            $f[$cle] = (string) $v;
        }
    } elseif ($cle === 'date') {
        if (is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
            $f['date'] = $v;
        }
    } elseif ($cle === 'personnes') {
        if (is_numeric($v) && (int) $v >= 1 && (int) $v <= 2000) {
            $f['personnes'] = (string) (int) $v;
        }
    } elseif ($cle === 'estimation') {
        $n = is_numeric($v) ? (float) $v : 0;
        if ($n > 0 && $n < 100000) {
            $f['estimation'] = round($n) . ' € HTVA (indicatif)';
        }
    } elseif ($cle === 'message') {
        $t = texte($v, $longueurs['message']);
        if ($t !== '') {
            $f['message'] = $t;
        }
    } else {
        $t = ligne($v, $longueurs[$cle] ?? 200);
        if ($t !== '') {
            $f[$cle] = $t;
        }
    }
}

$erreurs = [];
foreach (['besoin', 'name', 'email', 'message'] as $cle) {
    if (!isset($f[$cle])) {
        $erreurs[$cle] = 'Ce champ est nécessaire.';
    }
}
if (($data['consent'] ?? false) !== true) {
    $erreurs['consent'] = 'Votre accord est nécessaire pour traiter la demande.';
}
if (isset($f['email']) && !filter_var($f['email'], FILTER_VALIDATE_EMAIL)) {
    $erreurs['email'] = 'Cette adresse e-mail ne semble pas valide.';
}
if (isset($f['phone']) && !preg_match('/^\+?[0-9 ().\/-]{8,20}$/', $f['phone'])) {
    $erreurs['phone'] = 'Ce numéro ne semble pas valide.';
}
if (isset($f['date'])) {
    $jour = DateTimeImmutable::createFromFormat('!Y-m-d', $f['date'], new DateTimeZone('Europe/Brussels'));
    $aujourdhui = new DateTimeImmutable('today', new DateTimeZone('Europe/Brussels'));
    if (!$jour || $jour < $aujourdhui) {
        $erreurs['date'] = 'Cette date est déjà passée.';
    }
}
if (isset($f['message']) && mb_strlen($f['message']) < 10) {
    $erreurs['message'] = 'Décrivez votre projet en quelques mots.';
}
if (isset($f['message']) && preg_match_all('~https?://|www\.~i', $f['message']) > 1) {
    $erreurs['message'] = 'Un seul lien maximum dans le message.';
}
if ($erreurs) {
    repondre(400, ['ok' => false, 'error' => 'Merci de corriger les champs indiqués.', 'fields' => $erreurs]);
}

// E-mail à Hani (texte brut, « répondre » va directement au client)
$lignes = ['Nouvelle demande de devis depuis le site — ' . $choix['besoin'][$f['besoin']], ''];
foreach ($libelles as $cle => $libelle) {
    if (!isset($f[$cle]) || $cle === 'besoin') {
        continue;
    }
    $v = isset($choix[$cle]) ? $choix[$cle][$f[$cle]] : $f[$cle];
    if ($cle === 'date') {
        $v = implode('/', array_reverse(explode('-', $f['date'])));
    }
    if ($cle === 'message') {
        array_push($lignes, '', $v);
    } else {
        $lignes[] = $libelle . ' : ' . $v;
    }
}
array_push($lignes, '', '— Envoyé le ' . date('d/m/Y à H:i'));

$sujet = 'Devis ' . $choix['besoin'][$f['besoin']] . ' — ' . ($f['societe'] ?? $f['name']);
$entetes = [
    'From: ' . mb_encode_mimeheader(NOM_SITE, 'UTF-8') . ' <' . EXPEDITEUR . '>',
    'Reply-To: ' . $f['email'],
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];

$envoye = @mail(DESTINATAIRE, mb_encode_mimeheader($sujet, 'UTF-8'), implode("\n", $lignes), implode("\r\n", $entetes), '-f' . EXPEDITEUR);
if (!$envoye) {
    repondre(502, ['ok' => false, 'error' => 'Envoi impossible pour le moment. Appelez le +32 485 87 88 42 ou écrivez à ' . DESTINATAIRE . '.']);
}
repondre(200, ['ok' => true]);
