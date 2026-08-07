import { settings, type Lang } from './settings.svelte';

/**
 * Minimal dictionary i18n — no plural rules, no ICU, just key → string
 * per language with an optional `{name}` interpolation for counts.
 *
 * `t()` reads settings.lang during render, so any component that calls it
 * in its template re-renders when the language changes — same reactivity
 * pattern as effectiveKeybindings().
 *
 * The EN dictionary is the canonical copy and the fallback: a key missing
 * from FR renders English rather than a bare key. The UI never shows
 * untranslated keys.
 */

const en: Record<string, string> = {
	// Settings modal
	'settings.title': 'Settings',
	'settings.close': 'Close settings',
	'settings.closeEsc': 'Close (Esc)',
	'settings.tabs.preferences': 'Preferences',
	'settings.tabs.shortcuts': 'Shortcuts',
	'settings.tabs.importExport': 'Import / Export',
	'settings.tabs.account': 'Account',
	'settings.empty': 'Nothing here yet.',

	// Import / Export
	'settings.io.export': 'Export',
	'settings.io.exportDesc':
		'Your blocks, in an open format — leave whenever you want, nothing is locked in.',
	'settings.io.scope': 'Scope',
	'settings.io.scope.all': 'Whole tree',
	'settings.io.scope.page': 'Current page',
	'settings.io.scope.disabled': 'You are at the root — the current page is the whole tree.',
	'settings.io.format': 'Format',
	'settings.io.format.markdown': 'Markdown',
	'settings.io.format.opml': 'OPML',
	'settings.io.format.json': 'diple JSON',
	'settings.io.download': 'Download export',
	'settings.io.import': 'Import',
	'settings.io.importDesc': 'Bring blocks in from Markdown, OPML or diple JSON files.',
	'settings.io.file': 'Choose a file…',
	'settings.io.blocks.one': 'block',
	'settings.io.blocks.many': 'blocks',
	'settings.io.destination': 'Destination',
	'settings.io.destination.page': 'Into the current page',
	'settings.io.destination.root': 'As a new root block',
	'settings.io.importAction': 'Import blocks',
	'settings.io.error': 'Could not read this file.',

	// Language picker (endonyms — same in every language)
	'lang.fr': 'Français',
	'lang.en': 'English',

	// Preferences
	'pref.language': 'Language',
	'pref.language.label': 'Interface language',
	'pref.appearance': 'Appearance',
	'pref.theme.label': 'Theme',
	'pref.theme.light': 'Light',
	'pref.theme.dark': 'Dark',
	'pref.theme.system': 'System',
	'pref.fontSize.label': 'Text size',
	'pref.fontSize.small': 'Small',
	'pref.fontSize.medium': 'Medium',
	'pref.fontSize.large': 'Large',
	'pref.font.label': 'Font',
	'pref.font.sans': 'Default',
	'pref.font.serif': 'Serif',
	'pref.font.mono': 'Mono',
	'pref.width.label': 'Text column width',
	'pref.width.narrow': 'Narrow',
	'pref.width.medium': 'Medium',
	'pref.width.wide': 'Wide',
	'pref.blockCount.label': 'Block count',
	'pref.blockCount.desc':
		"The count shown on a collapsed block's bullet: how many blocks it hides.",
	'pref.blockCount.hidden': 'Hidden',
	'pref.blockCount.descendants': 'All blocks below',
	'pref.blockCount.children': 'Direct children',
	'pref.sidebar.label': 'Sidebar view',
	'pref.sidebar.desc': 'What the left panel lists as you browse the tree.',
	'pref.sidebar.siblings': 'Siblings',
	'pref.sidebar.page': 'Page tree',
	'pref.sidebar.home': 'Home',
	'pref.default': 'Default',
	'pref.reset.label': 'Reset',
	'pref.reset.desc': 'Restore every preference to its initial value',
	'pref.reset.action': 'Reset all settings',
	'pref.reset.confirm.title': 'Reset all settings?',
	'pref.reset.confirm.desc': 'Every preference returns to its initial value.',
	'pref.reset.confirm.action': 'Reset all settings',
	'pref.reset.cancel': 'Cancel',

	// Shortcuts tab
	'shortcuts.title': 'Shortcuts',
	'shortcuts.contextual': 'Contextual keys',
	'shortcuts.esc': 'Close the search, a block selection, the panels or settings',
	'shortcuts.backspace': 'Delete the selected blocks',

	// Navbar
	'nav.revealAll': 'Reveal all',
	'nav.collapseAll': 'Collapse all',
	'nav.revealAll.title': "Reveal all blocks — show every block's children again",
	'nav.collapseAll.title': 'Collapse all blocks — hide the children of every block in this view',
	'nav.help': 'Help — shortcuts and filters',
	'nav.closeHelp': 'Close help panel',

	// Sidebar
	'side.open': 'Open sidebar',
	'side.close': 'Close sidebar',
	'side.settings': 'Settings',
	'side.noRoots': 'No root blocks yet',
	'side.noSiblings': 'No siblings',
	'side.noChildren': 'No children yet',

	// Help panel
	'help.title': 'Help',
	'help.aria': 'Help',
	'help.shortcuts': 'Shortcuts',
	'help.filters': 'Search filters',
	'help.filters.hint': 'Type a filter in the search bar, optionally with words.',
	'help.filters.example': 'Example',
	'help.filter.root': 'Top-level blocks only',
	'help.filter.leaves': 'Blocks with no children',
	'help.filter.branches': 'Blocks with children',
	'help.filter.today': 'Blocks created today',

	// Zoom header
	'zoom.home': 'Home',
	'zoom.breadcrumb': 'Breadcrumb',

	// Palette
	'palette.placeholder': 'Search blocks or type a command… (:root, :leaves, :branches, :today)',
	'palette.commands': 'Commands',
	'palette.recent': 'Recent',
	'palette.blocks': 'Blocks',
	'palette.footer': '↑↓ navigate · ↵ open · esc close',

	// Sync status
	'sync.never': 'Never',
	'sync.online': 'Sync: online',
	'sync.offline': 'Sync: offline',
	'sync.syncing': 'Sync: syncing ({n} pending)',
	'sync.isOnline': 'Diple is',
	'sync.onlineWord': 'online',
	'sync.offlineWord': 'offline',
	'sync.pendingLocal': '{n} pending local changes',
	'sync.pendingRemote': '{n} pending remote changes',
	'sync.lastChange': 'Last change in server:',

	// Block menu (FormatMenuItems + BlockMenu)
	'menu.zoom': 'Zoom',
	'menu.copy': 'Copy',
	'menu.cut': 'Cut',
	'menu.paste': 'Paste',
	'menu.h1': 'Heading 1',
	'menu.h2': 'Heading 2',
	'menu.h3': 'Heading 3',
	'menu.bold': 'Bold',
	'menu.italic': 'Italic',
	'menu.highlight': 'Highlight',
	'menu.strike': 'Strikethrough',
	'menu.code': 'Code',
	'menu.delete': 'Delete',
	'menu.export': 'Export',
	'blockmenu.aria': 'Block options',

	// Mobile formatting bar
	'formatbar.aria': 'Formatting options',

	// Editor toasts / drag image
	'editor.errReverted': "Couldn't save — change reverted.",
	'editor.errKept': "Couldn't save — kept locally, will retry on next edit.",
	'editor.errCollapse': "Couldn't save collapse state.",
	'editor.errReveal': "Couldn't save reveal state.",
	'editor.errMove': "Couldn't save — move reverted.",
	'editor.errDelete': "Couldn't save — deletion reverted.",
	'editor.errPaste': "Couldn't save — paste reverted.",
	'editor.errSync': "Couldn't sync — please reload.",
	'editor.points': '{n} points',

	// Keybinding command labels (see COMMAND_LABELS in commands.ts)
	'cmd.block.split': 'Split block',
	'cmd.block.indent': 'Indent',
	'cmd.block.outdent': 'Outdent',
	'cmd.block.backspace': 'Delete block',
	'cmd.block.moveUp': 'Move block up',
	'cmd.block.moveDown': 'Move block down',
	'cmd.edit.undo': 'Undo',
	'cmd.edit.redo': 'Redo',
	'cmd.edit.copy': 'Copy',
	'cmd.edit.cut': 'Cut',
	'cmd.edit.paste': 'Paste',
	'cmd.view.zoomIn': 'Zoom into block',
	'cmd.view.zoomOut': 'Zoom out',
	'cmd.app.focusSearch': 'Focus search',

	// Hero
	'hero.hint': 'Search or command…',
	'hero.closePanel': 'Close panel',

	// Shared
	'common.empty': '(empty)'
};

const fr: Record<string, string> = {
	'settings.title': 'Paramètres',
	'settings.close': 'Fermer les paramètres',
	'settings.closeEsc': 'Fermer (Échap)',
	'settings.tabs.preferences': 'Préférences',
	'settings.tabs.shortcuts': 'Raccourcis',
	'settings.tabs.importExport': 'Importer / Exporter',
	'settings.tabs.account': 'Compte',
	'settings.empty': 'Rien pour l’instant.',

	// Importer / Exporter
	'settings.io.export': 'Exporter',
	'settings.io.exportDesc':
		'Vos blocs dans un format ouvert — partez quand vous voulez, rien n’est verrouillé.',
	'settings.io.scope': 'Portée',
	'settings.io.scope.all': 'Tout l’arbre',
	'settings.io.scope.page': 'Page courante',
	'settings.io.scope.disabled': 'Vous êtes à la racine — la page courante, c’est tout l’arbre.',
	'settings.io.format': 'Format',
	'settings.io.format.markdown': 'Markdown',
	'settings.io.format.opml': 'OPML',
	'settings.io.format.json': 'JSON diple',
	'settings.io.download': 'Télécharger l’export',
	'settings.io.import': 'Importer',
	'settings.io.importDesc': 'Importez des blocs depuis des fichiers Markdown, OPML ou JSON diple.',
	'settings.io.file': 'Choisir un fichier…',
	'settings.io.blocks.one': 'bloc',
	'settings.io.blocks.many': 'blocs',
	'settings.io.destination': 'Destination',
	'settings.io.destination.page': 'Dans la page courante',
	'settings.io.destination.root': 'Comme nouvelle racine',
	'settings.io.importAction': 'Importer les blocs',
	'settings.io.error': 'Impossible de lire ce fichier.',

	'lang.fr': 'Français',
	'lang.en': 'English',

	'pref.language': 'Langue',
	'pref.language.label': 'Langue de l’interface',
	'pref.appearance': 'Apparence',
	'pref.theme.label': 'Thème',
	'pref.theme.light': 'Clair',
	'pref.theme.dark': 'Sombre',
	'pref.theme.system': 'Système',
	'pref.fontSize.label': 'Taille du texte',
	'pref.fontSize.small': 'Petite',
	'pref.fontSize.medium': 'Moyenne',
	'pref.fontSize.large': 'Grande',
	'pref.font.label': 'Police',
	'pref.font.sans': 'Par défaut',
	'pref.font.serif': 'Serif',
	'pref.font.mono': 'Mono',
	'pref.width.label': 'Largeur de la colonne de texte',
	'pref.width.narrow': 'Étroite',
	'pref.width.medium': 'Moyenne',
	'pref.width.wide': 'Large',
	'pref.blockCount.label': 'Nombre de blocs',
	'pref.blockCount.desc':
		'Le nombre affiché sur la puce d’un bloc replié : combien de blocs il masque.',
	'pref.blockCount.hidden': 'Masquer',
	'pref.blockCount.descendants': 'Tous les blocs en dessous',
	'pref.blockCount.children': 'Enfants directs',
	'pref.sidebar.label': 'Vue du panneau latéral',
	'pref.sidebar.desc':
		'Ce que le panneau de gauche affiche pendant que vous naviguez dans l’arbre.',
	'pref.sidebar.siblings': 'Frères',
	'pref.sidebar.page': 'Arborescence de la page',
	'pref.sidebar.home': 'Accueil',
	'pref.default': 'Par défaut',
	'pref.reset.label': 'Réinitialisation',
	'pref.reset.desc': 'Rétablir toutes les préférences à leur valeur initiale',
	'pref.reset.action': 'Réinitialiser tous les réglages',
	'pref.reset.confirm.title': 'Réinitialiser tous les réglages ?',
	'pref.reset.confirm.desc': 'Chaque préférence revient à sa valeur initiale.',
	'pref.reset.confirm.action': 'Réinitialiser tous les réglages',
	'pref.reset.cancel': 'Annuler',

	'shortcuts.title': 'Raccourcis',
	'shortcuts.contextual': 'Touches contextuelles',
	'shortcuts.esc': 'Fermer la recherche, une sélection de blocs, les panneaux ou les paramètres',
	'shortcuts.backspace': 'Supprimer les blocs sélectionnés',

	'nav.revealAll': 'Tout déployer',
	'nav.collapseAll': 'Tout replier',
	'nav.revealAll.title': 'Tout déployer — réafficher les enfants de chaque bloc',
	'nav.collapseAll.title': 'Tout replier — masquer les enfants de chaque bloc de cette vue',
	'nav.help': 'Aide — raccourcis et filtres',
	'nav.closeHelp': 'Fermer le panneau d’aide',

	'side.open': 'Ouvrir le panneau latéral',
	'side.close': 'Fermer le panneau latéral',
	'side.settings': 'Paramètres',
	'side.noRoots': 'Aucun bloc racine pour l’instant',
	'side.noSiblings': 'Aucun frère',
	'side.noChildren': 'Aucun enfant pour l’instant',

	'help.title': 'Aide',
	'help.aria': 'Aide',
	'help.shortcuts': 'Raccourcis',
	'help.filters': 'Filtres de recherche',
	'help.filters.hint':
		'Tapez un filtre dans la barre de recherche, éventuellement accompagné de mots.',
	'help.filters.example': 'Exemple',
	'help.filter.root': 'Uniquement les blocs de premier niveau',
	'help.filter.leaves': 'Blocs sans enfant',
	'help.filter.branches': 'Blocs avec enfants',
	'help.filter.today': 'Blocs créés aujourd’hui',

	'zoom.home': 'Accueil',
	'zoom.breadcrumb': 'Fil d’Ariane',

	'palette.placeholder':
		'Rechercher des blocs ou taper une commande… (:root, :leaves, :branches, :today)',
	'palette.commands': 'Commandes',
	'palette.recent': 'Récents',
	'palette.blocks': 'Blocs',
	'palette.footer': '↑↓ naviguer · ↵ ouvrir · échap fermer',

	'sync.never': 'Jamais',
	'sync.online': 'Synchronisation : en ligne',
	'sync.offline': 'Synchronisation : hors ligne',
	'sync.syncing': 'Synchronisation : en cours ({n} en attente)',
	'sync.isOnline': 'Diple est',
	'sync.onlineWord': 'en ligne',
	'sync.offlineWord': 'hors ligne',
	'sync.pendingLocal': 'Changements locaux en attente : {n}',
	'sync.pendingRemote': 'Changements distants en attente : {n}',
	'sync.lastChange': 'Dernière modification sur le serveur :',

	'menu.zoom': 'Zoom',
	'menu.copy': 'Copier',
	'menu.cut': 'Couper',
	'menu.paste': 'Coller',
	'menu.h1': 'Titre 1',
	'menu.h2': 'Titre 2',
	'menu.h3': 'Titre 3',
	'menu.bold': 'Gras',
	'menu.italic': 'Italique',
	'menu.highlight': 'Surligner',
	'menu.strike': 'Barré',
	'menu.code': 'Code',
	'menu.delete': 'Supprimer',
	'menu.export': 'Exporter',
	'blockmenu.aria': 'Options du bloc',

	// Barre de formatage mobile
	'formatbar.aria': 'Options de formatage',

	'editor.errReverted': 'Impossible d’enregistrer — modification annulée.',
	'editor.errKept':
		'Impossible d’enregistrer — conservé localement, nouvelle tentative à la prochaine modification.',
	'editor.errCollapse': 'Impossible d’enregistrer l’état de repli.',
	'editor.errReveal': 'Impossible d’enregistrer l’état de déploiement.',
	'editor.errMove': 'Impossible d’enregistrer — déplacement annulé.',
	'editor.errDelete': 'Impossible d’enregistrer — suppression annulée.',
	'editor.errPaste': 'Impossible d’enregistrer — collage annulé.',
	'editor.errSync': 'Synchronisation impossible — rechargez la page.',
	'editor.points': '{n} points',

	'cmd.block.split': 'Diviser le bloc',
	'cmd.block.indent': 'Indenter',
	'cmd.block.outdent': 'Désindenter',
	'cmd.block.backspace': 'Supprimer le bloc',
	'cmd.block.moveUp': 'Déplacer le bloc vers le haut',
	'cmd.block.moveDown': 'Déplacer le bloc vers le bas',
	'cmd.edit.undo': 'Annuler',
	'cmd.edit.redo': 'Rétablir',
	'cmd.edit.copy': 'Copier',
	'cmd.edit.cut': 'Couper',
	'cmd.edit.paste': 'Coller',
	'cmd.view.zoomIn': 'Zoomer dans le bloc',
	'cmd.view.zoomOut': 'Dézoomer',
	'cmd.app.focusSearch': 'Recherche',

	'hero.hint': 'Rechercher ou commander…',
	'hero.closePanel': 'Fermer le panneau',

	'common.empty': '(vide)'
};

const dicts: Record<Lang, Record<string, string>> = { en, fr };

/** Translate a key, with optional `{name}` interpolation for counts. */
export function t(key: string, vars?: Record<string, string | number>): string {
	const text = dicts[settings.lang]?.[key] ?? dicts.en[key] ?? key;
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match));
}
