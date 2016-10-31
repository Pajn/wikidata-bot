const datastore = require('nedb-promise')
const Rx = require('rxjs')
const data = require('./data')
const {delay} = require('./helpers')
const {login, getEntity, editEntity, claim, itemSnak, quantitySnak, timeSnak, qualifier} = require('./wikidata')

const country = 'P17'
const locatedInTheAdministrative = 'P131'
const statedIn = 'P248'
const swedishMunicipalityCode = 'P525'
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
  const db = datastore({
    filename: 'db.json',
    autoload: true,
  })

  Rx.Observable.fromPromise(login(data.credentials.user, data.credentials.password))
    // .flatMap(() =>   Rx.Observable.of('Q2224856'))
    .flatMap(() => Rx.Observable.from(data.items))
    .skip(1463)
    .take(600)
  //   .skip(358)
  //   .take(400)
    // Change the delay 
    .concatMap(delay(1000, getEntity))
    .concatMap(item => {
      const dbItem = {
        qid: item.id,
        labels: item.labels,
        descriptions: item.descriptions,
        urban: true,
      }

      if (item.claims[swedishUrbanAreaCode].length !== 1) {
        console.error(`${item.id} has ${item.claims[swedishUrbanAreaCode].length} area codes`)
        dbItem.areaCodeClaims = item.claims[swedishUrbanAreaCode]
        dbItem.error = 'not one area code'
        return db.insert([dbItem])
      }

      const urbanAreaCode = item.claims[swedishUrbanAreaCode][0].mainsnak.datavalue.value
        // Wikidata area codes sometimes have letters in them for some reason?
        .replace(/[A-Z]+/i, '')
      const urbanArea = data.urbanAreas[urbanAreaCode]
      const changes = []

      dbItem.urbanAreaCode = urbanAreaCode

      if (item.claims[locatedInTheAdministrative]) {
        dbItem.locatedInClaims = item.claims[locatedInTheAdministrative]
      }
      if (item.claims[swedishMunicipalityCode]) {
        dbItem.municipalityCodeClaims = item.claims[swedishMunicipalityCode]
      }

      if (!item.claims[country]) {
        console.error(`${item.id} has no country`)
        dbItem.error = 'no country'
        return db.insert([dbItem])
      } else if (item.claims[country][0].mainsnak.datavalue.value.id != sweden) {
        console.error(`${item.id} is not in sweden`)
        dbItem.countryClaims = item.claims[country]
        dbItem.error = 'not in sweden'
        return db.insert([dbItem])
      }
      if (!urbanArea) {
        console.error(`urbanArea ${urbanArea} on item ${item.id} not found`)
        dbItem.error = 'urbanArea missing'
        return db.insert([dbItem])
      } else {
        dbItem.name = urbanArea.name
        dbItem.municipailty = urbanArea.municipailty
      }

      if (urbanArea.population && !item.claims[population]) {
        dbItem.newPopulation = urbanArea.population
        changes.push(claim(
          quantitySnak(population, urbanArea.population),
          references,
          [qualifier(pointInTime, scbTime)]
        ))
      } else {
        if (!urbanArea.population) {
          dbItem.noPopulation = true
          console.error(`${item.id} has no population`)
        }
        if (item.claims[population]) {
          dbItem.populationClaims = item.claims[population]
        }
      }

      if (urbanArea.area && !item.claims[area]) {
        dbItem.newArea = urbanArea.area
        changes.push(claim(
          quantitySnak(area, urbanArea.area, hectareUrl),
          references,
          [
            qualifier(pointInTime, scbTime),
          ]
        ))
      } else {
        if (!urbanArea.area) {
          dbItem.noArea = true
          console.error(`${item.id} has no area`)
        }
        if (item.claims[area]) {
          dbItem.areaClaims = item.claims[area]
        }
      }

      dbItem.changes = changes

      if (changes.length > 0) return ( 
        editEntity(item.id, changes).then(() => {
          console.log(`${item.id} updated`)
          dbItem.changed = true
          return db.insert([dbItem])
        })
      )
      else return db.insert([dbItem])
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
