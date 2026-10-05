# Imagery

All photographs are AI-generated in the one approved style (checkpoint 1): warm natural light, real Iranian homes, gardens and clinics, people and pets together, shallow depth of field, no stock gloss, **no text in the image**, subject inside the central 60% so 16:9, 4:3 and 1:1 crops all hold. People are fictional; faces of crowds are not identifiable. Every image carries its Persian alt text (`imageAltFa`), listed in `sample-content/images.json`.

| Prefix | Ratio | Slots |
|---|---|---|
| `breeds-*` | 16:9 | 10 breed photos (taxonomy) |
| `animals-animal-1…8` | 4:3 | record photos of the sample animals (animal-8 is the cat) |
| `listings-*-1/-2` | 4:3 | marketplace listings: full body + face close-up |
| `people-acc-*` | 1:1 | account avatars (fictional people) |
| `vets-vet-1…6` | 1:1 | veterinarian portraits |
| `centres-centre-1…5` | 16:9 | clinics, hospital, laboratory, genetics centre |
| `communities-community-1…5` | 16:9 | associations and clubs (faces not identifiable) |
| `content-*` | 16:9 | article, news and club-post photos (announcements have no photo by design) |
| `products-*` | 1:1 | shop packshots on white, no readable branding |
| `home-hero-*`, `sample-hero-dog.jpg` | 16:9 | home hero carousel |

Missing images are designed, never blank: `bg-media-empty` + the symbol at 40% + the Persian alt text (*RecordImage*).
