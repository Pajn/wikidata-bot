const Rx = require('rxjs')
const data = require('./data')
const {delay} = require('./helpers')
const {login, getEntity, editEntity, claim, itemSnak, quantitySnak, timeSnak, qualifier} = require('./wikidata')

const country = 'P17'
// const locatedInTheAdministrative = 'P131'
const statedIn = 'P248'
// const swedishMunicipalityCode = 'P525'
const pointInTime = 'P585'
const swedishUrbanAreaCode = 'P775'
// const referenceUrl = 'P854'
const population = 'P1082'
const area = 'P2046'

const swedenNumeric = 34
const sweden = `Q${swedenNumeric}`
const hectareNumeric = 35852
const hectare = `Q${hectareNumeric}`
const hectareUrl = `http://www.wikidata.org/entity/${hectare}`
const localities2010Numeric = 14907217
// const localities2010 = `Q${localities2010Numeric}`

const scbTime = timeSnak(pointInTime, '%2b2010-12-31T00:00:00Z')

const references = [
  {
    snaks: {
      [statedIn]: [itemSnak(statedIn, localities2010Numeric)],
    },
    'snaks-order': [
      'P248'
    ]
  }
]

function main() {
  Rx.Observable.fromPromise(login(data.credentials.user, data.credentials.password))
    .flatMap(() => Rx.Observable.from(data.items))
    .skip(4)
    .take(1)
    // Change the delay 
    .concatMap(delay(1000, getEntity))
    .concatMap(item => {
      const urbanAreaCode = item.claims[swedishUrbanAreaCode][0].mainsnak.datavalue.value
        // Wikidata area codes sometimes have letters in them for some reason?
        .replace(/[A-Z]+/i, '')
      const urbanArea = data.urbanAreas[urbanAreaCode]
      const changes = []

      if (!item.claims[country]) {
        console.error(`${item.id} has no country`)
        return
      } else if (item.claims[country][0].mainsnak.datavalue.value.id != sweden) {
        console.error(`${item.id} is not in sweden`)
        return
      }
      if (!item.claims[population]) {
        changes.push(claim(
          quantitySnak(population, urbanArea.population),
          references,
          [qualifier(pointInTime, scbTime)]
        ))
      }
      if (!item.claims[area]) {
        changes.push(claim(
          quantitySnak(area, urbanArea.area, hectareUrl),
          references,
          [
            qualifier(pointInTime, scbTime),
          ]
        ))
      }

      if (changes.length > 0) return editEntity(item.id, changes).then(() => {
        console.log(`${item.id} updated`)
      })
      else return changes
    })
    .subscribe(
      () => {},
      error => {
        console.error('Error:', error, error.stack)
      },
      () => console.log('Done')
    )
}

main()
