/* ============================
   SCALELAB AI — INFRASTRUCTURE BREAKDOWNS (video / ad creatives)
   ============================
   Each object below renders one card in the "See how the infrastructure is built"
   section (#breakdowns). To publish a creative, fill in `media` (and optionally
   `cta`) on an existing card, or add a new object. No layout changes needed.

   Fields
     id           Unique, lowercase, used in analytics (creative_id).
     kicker       Small label above the title.
     title        Card title.
     description  One or two sentences.
     diagram      Placeholder artwork while there is no media: 'stack' | 'reply' | 'system'.
     media        null while in preparation, or one of:
                    { type: 'video', src: 'media/file.mp4', poster: 'media/file.webp', label: 'Accessible description' }
                    { type: 'embed', src: 'https://www.youtube-nocookie.com/embed/ID', poster: 'media/thumb.webp', label: '...' }
                    { type: 'image', src: 'media/thumb.webp', alt: 'Describe the image', href: 'https://...' }
                  Video and embed files load only after the visitor presses play.
     cta          null, or { label: 'Watch on LinkedIn', href: 'https://...' }
     duration     Optional display string such as '2:40'. Only set it once the media exists.

   Analytics (GA4, existing tag): creative_view (card with media half visible for
   one second), creative_play, creative_click. Placeholders send nothing.
*/
window.SCALELAB_CREATIVES = [
  {
    id: 'outbound-infrastructure',
    kicker: 'Breakdown 01',
    title: 'Building the outbound infrastructure',
    description: 'How targeting, research, personalization, inboxes and campaign controls work together.',
    diagram: 'stack',
    media: null,
    cta: null,
  },
  {
    id: 'reply-to-meeting',
    kicker: 'Breakdown 02',
    title: 'From reply to qualified meeting',
    description: 'How responses are identified, qualified, routed and tracked.',
    diagram: 'reply',
    media: null,
    cta: null,
  },
  {
    id: 'inside-the-system',
    kicker: 'Breakdown 03',
    title: 'Inside the ScaleLab system',
    description: 'A walkthrough of the infrastructure behind a live acquisition campaign.',
    diagram: 'system',
    media: null,
    cta: null,
  },
];
