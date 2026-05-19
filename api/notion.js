/**
 * DailyReport — Vercel Serverless Function
 * POST /api/notion → crée page Notion → retourne { notionUrl }
 *
 * Variables d'environnement à configurer dans Vercel Dashboard :
 *   NOTION_TOKEN        (secret)
 *   NOTION_DATABASE_ID  (text)
 */

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { date, tasks = [], totalTime, client = '', senderName = 'Paulin' } = req.body;

  // ── Blocs contenu de la page ─────────────────────────────────────────────

  const blocks = [];

  blocks.push(callout(`👤 Client : ${client || '—'}   ·   ⏱ Temps total : ${totalTime}   ·   📋 ${tasks.length} tâche(s)`));
  blocks.push(heading2('Tâches effectuées'));

  for (const t of tasks) {
    blocks.push(bulletItem(`${t.task}${t.result ? ' → ' + t.result : ''}`, t.difficulty?.includes('Urgent')));
    if (t.notes)  blocks.push(quote(t.notes));
    for (const l of t.links  || []) { if (l.url) blocks.push(linkBlock(l.label || l.url, l.url)); }
    if (t.files?.length) blocks.push(paragraph(`📎 Fichiers joints : ${t.files.map(f => f.name).join(', ')}`));
  }

  blocks.push({ object: 'block', type: 'divider', divider: {} });
  blocks.push(paragraph(
    `Rapport généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} par ${senderName}`
  ));

  // ── Appel Notion API ──────────────────────────────────────────────────────

  const title = `Compte rendu – ${formatDate(date)}${client ? ' – ' + client : ''}`;

  const notionRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        Name:           { title:     [{ type: 'text', text: { content: title } }] },
        Date:           { date:      { start: date || new Date().toISOString().split('T')[0] } },
        Client:         { rich_text: [{ type: 'text', text: { content: client } }] },
        'Temps total':  { rich_text: [{ type: 'text', text: { content: totalTime || '' } }] },
        Tâches:         { number: tasks.length },
      },
      children: blocks,
    }),
  });

  const page = await notionRes.json();

  if (!notionRes.ok) {
    console.error('Notion error:', page);
    return res.status(502).json({ error: page.message || 'Notion API error', details: page });
  }

  const notionUrl = `https://www.notion.so/${page.id.replace(/-/g, '')}`;
  return res.status(200).json({ notionUrl, pageId: page.id });
}

// ── Helpers blocs Notion ──────────────────────────────────────────────────────

const rt = (content, bold = false, italic = false) => ({
  type: 'text', text: { content }, annotations: { bold, italic }
});

const heading2   = text => ({ object: 'block', type: 'heading_2',           heading_2:           { rich_text: [rt(text)] } });
const paragraph  = text => ({ object: 'block', type: 'paragraph',           paragraph:           { rich_text: [rt(text)] } });
const quote      = text => ({ object: 'block', type: 'quote',               quote:               { rich_text: [rt(text, false, true)] } });
const callout    = text => ({ object: 'block', type: 'callout',             callout:             { rich_text: [rt(text)], icon: { type: 'emoji', emoji: '📊' }, color: 'gray_background' } });
const bulletItem = (text, bold = false) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [rt(text, bold)] } });
const linkBlock  = (label, url) => ({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ type: 'text', text: { content: `🔗 ${label}`, link: { url } }, annotations: { color: 'blue' } }] }
});

const formatDate = dateStr =>
  new Date((dateStr || new Date().toISOString().split('T')[0]) + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
