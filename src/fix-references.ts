import datastore from 'nedb-promise'
import * as Rx from 'rxjs'
import * as util from 'util'
import {
  localities2010Numeric,
  mapTime,
  references,
} from './area-helpers'
import * as data from './data'
import {delay, partition} from './helpers'
import {
  areaProperty,
  editClaim,
  editEntity,
  getEntity,
  itemSnak,
  login,
  pointInTime,
  populationProperty,
  statedIn,
  swedishUrbanAreaCode,
  timeSnak,
} from './wikidata'
Error.stackTraceLimit = 500

// const statedIn = 'P248'
// const pointInTime = 'P585'
// const swedishUrbanAreaCode = 'P775'
// const retrieved = 'P813'
// const populationProperty = 'P1082'
// const areaProperty = 'P2046'

// const localities2010Numeric = 14907217
// const statisticsDatabaseNumeric = 27579148

// const years = ['60', '65', '70', '75', '80', '90', '95', '00', '05', '10']

// const mapTime = years.reduce((map, year) => {
//   if (+year < 20) {
//     map[`+20${year}-00-00T00:00:00Z`] = year
//     map[`+20${year}-12-00T00:00:00Z`] = year
//     map[`+20${year}-12-31T00:00:00Z`] = year
//     map[`%2b20${year}-12-31T00:00:00Z`] = year
//   } else {
//     map[`+19${year}-00-00T00:00:00Z`] = year
//     map[`+19${year}-12-00T00:00:00Z`] = year
//     map[`+19${year}-12-31T00:00:00Z`] = year
//     map[`%2b19${year}-12-31T00:00:00Z`] = year
//   }
//   return map
// }, {
//   '+2010-01-01T00:00:00Z': '10',
// })

// const references = [
//   {
//     snaks: {
//       [statedIn]: [itemSnak(statedIn, statisticsDatabaseNumeric)],
//       [retrieved]: [timeSnak(retrieved, '%2b2016-11-01T00:00:00Z')],
//     },
//     'snaks-order': [
//       statedIn,
//       retrieved,
//     ]
//   }
// ]

function checkReferences(item, area, year, changes, property, name) {
  const value = area[name][year]
  if (value && item.claims[property]) {
    // console.log('claims', util.inspect(item.claims[property], {colors: true, depth: 10}))
    const claim = item.claims[property]
      .filter(claim => claim.references)
      .filter(claim => claim.references.length === 1)
      .filter(claim => claim.references[0].snaks[statedIn])
      .filter(claim => claim.references[0].snaks[statedIn].length === 1)
      .filter(claim => Object.keys(claim.references[0].snaks).length === 1)
      .filter(claim => claim.qualifiers)
      .filter(claim => claim.qualifiers[pointInTime])
      .filter(claim => claim.qualifiers[pointInTime].length === 1)
      .filter(claim => claim.references[0].snaks[statedIn][0].datavalue.value['numeric-id'] === localities2010Numeric)
      .find(claim => mapTime[claim.qualifiers[pointInTime][0].datavalue.value.time] === year)

    if (claim) {
      // console.log('claim', claim)

      changes.push(editClaim(claim, {
        references,
      }))
    }
  }
}

function main() {
  const urbanAreas = data.getUrbanAreas()
  const db = datastore({
    filename: 'db.json',
    autoload: true,
  })

  return Rx.Observable.fromPromise(login(data.credentials.user, data.credentials.password))
    .flatMap(() => db.find({'changes': {$exists: true}, correctedChangesReferences: {$exists: false}}))
    .flatMap(items => items as any[])
    // .filter(item => item.edits.some(edit => edit.type === 'claim'))
    // .skip(140)
    .concatMap(dbItem => delay(2000, getEntity)(dbItem.qid).then(item => ({item, dbItem})))
    .concatMap(({dbItem, item}) => {

      let urbanAreaCode
      if (item.claims[swedishUrbanAreaCode].length === 1) {
        urbanAreaCode = item.claims[swedishUrbanAreaCode][0].mainsnak.datavalue.value
      } else if (item.claims[swedishUrbanAreaCode].length === 2) {
        const codes = item.claims[swedishUrbanAreaCode]
          .map(claim => claim.mainsnak.datavalue.value.toUpperCase())
          .sort((a, b) => {
            if (a < b) return -1
            if (a > b) return 1
            return 0
          })

        if (codes[0] === codes[1]) {
          urbanAreaCode = codes[1]
          // remove one
        } else if (codes[0] === codes[1].replace(/^T/)) {
          urbanAreaCode = codes[1]
          // remove without t
        } else if (/^T\d/.exec(codes[0]) && /^TX/.exec(codes[1])) {
          if (urbanAreas[codes[0]]) {
            urbanAreaCode = codes[0]
          } else {
            urbanAreaCode = codes[1]
          }
        } else {
          console.error(`${item.id} has ${item.claims[swedishUrbanAreaCode].length} area codes`)
          return []
        }
      } else if (item.claims[swedishUrbanAreaCode].length !== 1) {
        console.error(`${item.id} has ${item.claims[swedishUrbanAreaCode].length} area codes`)
        return []
      }
      if (/^\d/.test(urbanAreaCode)) {
        urbanAreaCode = `T${urbanAreaCode}`
      }
      const urbanArea = urbanAreas[urbanAreaCode]
      if (!urbanArea) {
        console.error(`urbanArea ${urbanAreaCode} on item ${item.id} not found`)
        return []
      }

      const area = urbanArea
      area.name = area.name.trim()
      const changes = []

      const populationEdits = dbItem.changes
        .filter(edit => edit.mainsnak && edit.mainsnak.property === populationProperty)
        .filter(edit => edit.qualifiers[pointInTime])
        .map(edit => mapTime[edit.qualifiers[pointInTime][0].datavalue.value.time])

      const areaEdits = dbItem.changes
        .filter(edit => edit.mainsnak && edit.mainsnak.property === areaProperty)
        .filter(edit => edit.qualifiers[pointInTime])
        .map(edit => mapTime[edit.qualifiers[pointInTime][0].datavalue.value.time])

      populationEdits.forEach(year => {
        checkReferences(item, area, year, changes, populationProperty, 'population')
      })

      areaEdits.forEach(year => {
        checkReferences(item, area, year, changes, areaProperty, 'area')
      })

      const edited = changes.length > 0
        ? partition(changes, 4, changes =>
            // Promise.resolve(console.log(util.inspect(changes, {colors: true, depth: 10})))
            editEntity(item.id, changes).then(() => {
              console.log(`${item.id} updated ${changes.length}`)
            })
          )
        : Promise.resolve()

      return edited
        .then(() => db.update({qid: item.id}, {$set: {correctedChangesReferences: true}}))
        .then(() => console.log(`fixed ${item.id}`))
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
