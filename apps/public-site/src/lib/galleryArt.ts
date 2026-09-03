/**
 * galleryArt.ts — the 3D gallery's image set.
 *
 * These are real photographs — Maitri, Bharati and Dakshin Gangotri
 * stations, plus general Antarctic scenes (aurora, an icebreaker, a field
 * camp) — sourced from Wikimedia Commons, where every file is required to
 * carry a free license (CC BY / CC BY-SA, or public domain for US federal
 * government works like the NSF icebreaker photo) before it can be hosted
 * there at all. Filenames double as attribution: see CREDITS below for the
 * original file and photographer/uploader per image, as the license
 * requires.
 */

export interface GalleryScene {
  id: string
  title: string
  caption: string
  src: string
}

export const CREDITS: Record<string, string> = {
  'maitri-aerial': 'Wikimedia Commons — "An aerial view of the Indian Station Maitri, Antarctica on February 2, 2005"',
  'maitri-flag': 'Wikimedia Commons — "A helicopter carries the Indian Flag while passing over the Indian Station Maitri, February 2, 2005"',
  'bharati-station': 'Wikimedia Commons — "Bharati permanent Antarctic research station"',
  'dakshin-station': 'Wikimedia Commons — "Dakshin Gangotri station"',
  'dakshin-aerial': 'Wikimedia Commons — "Aerial view of the Dakshin Gangotri under construction"',
  'lake-priyadarshini': 'Wikimedia Commons — "Lake Indira Priyadarshini"',
  aurora: 'Wikimedia Commons / NASA — "ISS-52 Aurora australis above Antarctica"',
  'aurora-panorama': 'Wikimedia Commons — "Aurora australis panorama"',
  icebreaker: 'Wikimedia Commons / US National Science Foundation — "Icebreaker Nathaniel B. Palmer" (public domain)',
  'field-camp': 'Wikimedia Commons — photo by Christopher Michel, Union Glacier Camp (CC BY 2.0)',
}

export function buildGallery(): GalleryScene[] {
  return [
    {
      id: 'maitri-aerial',
      title: 'Maitri Station',
      caption: 'Maitri — Schirmacher Oasis, Queen Maud Land',
      src: '/photos/maitri-aerial.jpg',
    },
    {
      id: 'bharati-station',
      title: 'Bharati Station',
      caption: 'Bharati — Larsemann Hills, on stilts over the ice shelf',
      src: '/photos/bharati-station.jpg',
    },
    {
      id: 'dakshin-station',
      title: 'Dakshin Gangotri',
      caption: "India's first Antarctic station, 1984–1990",
      src: '/photos/dakshin-station.jpg',
    },
    {
      id: 'maitri-flag',
      title: 'Flag Over Maitri',
      caption: 'The Indian flag, carried by helicopter over Maitri, 2005',
      src: '/photos/maitri-flag.jpg',
    },
    {
      id: 'dakshin-aerial',
      title: 'Dakshin Gangotri, Under Construction',
      caption: 'Dakshin Gangotri station under construction, 1983',
      src: '/photos/dakshin-aerial.jpg',
    },
    {
      id: 'lake-priyadarshini',
      title: 'Lake Priyadarshini',
      caption: 'Lake Priyadarshini, near Maitri Station',
      src: '/photos/lake-priyadarshini.jpg',
    },
    {
      id: 'aurora',
      title: 'Aurora Australis',
      caption: 'Aurora australis over Antarctica, seen from the ISS',
      src: '/photos/aurora.jpg',
    },
    {
      id: 'aurora-panorama',
      title: 'Aurora, Panorama',
      caption: 'Aurora australis, wide panorama',
      src: '/photos/aurora-panorama.jpg',
    },
    {
      id: 'icebreaker',
      title: 'Resupply Icebreaker',
      caption: 'Icebreaker Nathaniel B. Palmer, Antarctic waters',
      src: '/photos/icebreaker.jpg',
    },
    {
      id: 'field-camp',
      title: 'Field Camp',
      caption: 'A tent field camp, Union Glacier',
      src: '/photos/field-camp.jpg',
    },
  ]
}
