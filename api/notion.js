/**
 * DailyReport — Vercel Serverless Function
 * POST /api/notion → crée ou complète la page du jour dans Notion
 *
 * Variables d'environnement Vercel :
 *   NOTION_TOKEN        (secret)
 *   NOTION_DATABASE_ID  (text)
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
  const { date, tasks = [], totalTime, client = '', senderName = 'Paulin' } = req.body;

  const notionHeaders = {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // ── Titre = juste la date ────────────────────────────────────────────────
  const dateStr = date || new Date().toISOString().split('T')[0];
  const title = formatDate(dateStr); // ex: "Mardi 19 mai 2026"

  // ── Récupérer le schéma de la database (nom colonne titre) ───────────────
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}`, {
    headers: notionHeaders,
  });
  const db = await dbRes.json();
  if (!dbRes.ok) return res.status(502).json({ error: db.message, details: db });

  const titleKey = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0] || 'Nom de la tâche';

  // ── Chercher si page du jour existe déjà ─────────────────────────────────
  const queryRes = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: notionHeaders,
    body: JSON.stringify({
      filter: {
        property: titleKey,
        title: { equals: title }
      },
      page_size: 1
    }),
  });
  const queryData = await queryRes.json();
  const existingPage = queryData.results?.[0];

  // ── Blocs nouveaux à ajouter ─────────────────────────────────────────────
  const newBlocks = [];

  newBlocks.push(callout(`👤 ${client || '—'}   ·   ⏱ ${totalTime}   ·   ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`));

  for (const t of tasks) {
    newBlocks.push(bulletItem(`${t.task}${t.result ? ' → ' + t.result : ''}`, t.difficulty?.includes('Urgent')));
    if (t.notes) newBlocks.push(quote(t.notes));
    for (const l of t.links || []) { if (l.url) newBlocks.push(linkBlock(l.label || l.url, l.url)); }

    // Fichiers → callout avec icône selon type
    if (t.files?.length) {
      for (const f of t.files) {
        const icon = f.type?.startsWith('image/') ? '🖼️' : f.type?.includes('pdf') ? '📄' : f.type?.includes('sheet') || f.type?.includes('excel') ? '📊' : '📎';
        const sizeKb = f.size ? ` · ${Math.round(f.size / 1024)}ko` : '';
        newBlocks.push({
          object: 'block', type: 'callout',
          callout: {
            rich_text: [{ type: 'text', text: { content: `${f.name}${sizeKb}` } }],
            icon: { type: 'emoji', emoji: icon },
            color: 'gray_background'
          }
        });
      }
    }
  }

  newBlocks.push({ object: 'block', type: 'divider', divider: {} });

  // Difficulté majoritaire
  const diffMap = { 'Facile': 'Facile', 'Moyen': 'Moyen', 'Complexe': 'Complexe', '⚡ Urgent': 'Urgent', 'Urgent': 'Urgent' };
  const difficulte = diffMap[tasks[0]?.difficulty] || 'Moyen';
  const resumeText = tasks.map(t => `• ${t.task}${t.result ? ' → ' + t.result : ''}`).join('\n');

  let pageId, notionUrl;

  if (existingPage) {
    // ── Page existe → append les blocs + mettre à jour Temps total ──────────
    pageId = existingPage.id;

    await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({ children: newBlocks }),
    });

    // Mettre à jour Temps total et Client
    await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({
        properties: {
          "Client":      { rich_text: [{ type: 'text', text: { content: client } }] },
          "Temps total": { rich_text: [{ type: 'text', text: { content: totalTime || '' } }] },
          "Difficulté":  { select: { name: difficulte } },
          "Résumé":      { rich_text: [{ type: 'text', text: { content: resumeText } }] },
        }
      }),
    });

    notionUrl = `https://www.notion.so/${pageId.replace(/-/g, '')}`;
    return res.status(200).json({ notionUrl, pageId, updated: true });

  } else {
    // ── Page n'existe pas → créer ────────────────────────────────────────────
    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          [titleKey]:    { title:     [{ type: 'text', text: { content: title } }] },
          "Client":      { rich_text: [{ type: 'text', text: { content: client } }] },
          "Résumé":      { rich_text: [{ type: 'text', text: { content: resumeText } }] },
          "Temps total": { rich_text: [{ type: 'text', text: { content: totalTime || '' } }] },
          "Difficulté":  { select:    { name: difficulte } },
          "État":        { status:    { name: 'Terminé' } },
        },
        children: newBlocks,
      }),
    });

    const page = await createRes.json();
    if (!createRes.ok) {
      console.error('Notion error:', page);
      return res.status(502).json({ error: page.message, details: page });
    }

    pageId = page.id;
    notionUrl = `https://www.notion.so/${pageId.replace(/-/g, '')}`;
    return res.status(200).json({ notionUrl, pageId, updated: false });
  }
  } catch (e) {
    console.error('HANDLER CRASH:', e.message, e.stack);
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
};

// ── Helpers blocs Notion ──────────────────────────────────────────────────────

const rt = (content, bold = false, italic = false) => ({
  type: 'text', text: { content }, annotations: { bold, italic }
});

const heading2   = text => ({ object: 'block', type: 'heading_2',  heading_2:  { rich_text: [rt(text)] } });
const paragraph  = text => ({ object: 'block', type: 'paragraph',  paragraph:  { rich_text: [rt(text)] } });
const quote      = text => ({ object: 'block', type: 'quote',      quote:      { rich_text: [rt(text, false, true)] } });
const callout    = text => ({ object: 'block', type: 'callout',    callout:    { rich_text: [rt(text)], icon: { type: 'emoji', emoji: '📋' }, color: 'gray_background' } });
const bulletItem = (text, bold = false) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [rt(text, bold)] } });
const linkBlock  = (label, url) => ({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ type: 'text', text: { content: `🔗 ${label}`, link: { url } }, annotations: { color: 'blue' } }] }
});

const formatDate = dateStr =>
  new Date((dateStr || new Date().toISOString().split('T')[0]) + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
