import * as fs from 'fs'
import datastore from 'nedb-promise'
import {updateIn} from 'redux-decorated'
import * as Rx from 'rxjs'
import * as util from 'util'
import {
  checkArea,
  checkAreaClaims,
  checkLabels,
  checkLocatedIn,
  checkPopulation,
  checkPopulationClaims,
  referencesMinor,
  years
} from './area-helpers'
import * as data from './data'
import {DbItem, WdItem, Change, Area} from './entities'
import {asMap, delay, partition} from './helpers'
import * as queries from './queries'
import {
  addClaim,
  addLabel,
  Claim,
  editClaim,
  editEntity,
  getEntity,
  itemSnak,
  login,
  newClaim,
  qualifier,
  QuantitySnak,
  quantitySnak,
  QuantityValue,
  removeClaim,
  sparqlQuery,
  swedishMinorUrbanAreaCode,
  timeSnak
} from './wikidata'
Error.stackTraceLimit = 500

/*
locality in Vingåker Municipality, Sweden
småort i Vingåkers kommun
*/

function main() {
  const minorUrbanAreas = data.getMinorUrbanAreas()
  const db = datastore({
    filename: 'db.json',
    autoload: true,
  })

  // return db.find({'locatedInClaims': {$exists: false}})
  //   .then(a => console.log(a))

  Rx.Observable.fromPromise(db.ensureIndex({fieldName: 'qid', unique: true}))
    .flatMap(() => Rx.Observable.fromPromise(login(data.credentials.user, data.credentials.password)))
    // .flatMap(() => Rx.Observable.from(itemsWithoutArea))
    // .flatMap(() =>  Rx.Observable.of('Q3335533'))
    // .flatMap(() => db.find({'labels': {$exists: true}, 'labels.en': {$exists: false}}))
    // .flatMap(items => items)
    // .map(item => item.qid)
    .flatMap(() => sparqlQuery(queries.minorAreasWithoutPopulation))
    .flatMap((body: any) => (body.results.bindings as any[]).map(item => ({
      qid: item.item.value.replace(/.*?\/(Q[0-9]+)$/, '$1'),
      name: item.itemLabel.value,
    })))
    .map(item => item.qid)
    .skip(5)
    .take(0)
    // Change the delay
    .concatMap(delay(1000, getEntity))
    .concatMap(item => {
      const dbItem: DbItem = {
        qid: item.id,
        labels: item.labels,
        descriptions: item.descriptions,
        correctedReferences: true,
        minor: true,
      }

      let minorUrbanAreaCode
      if (item.claims[swedishMinorUrbanAreaCode].length === 1) {
        minorUrbanAreaCode = item.claims[swedishMinorUrbanAreaCode][0].mainsnak.datavalue.value
      } else if (item.claims[swedishMinorUrbanAreaCode].length === 2) {
        const codes = item.claims[swedishMinorUrbanAreaCode]
          .map(claim => claim.mainsnak.datavalue.value.toUpperCase())
          .sort((a, b) => {
            if (a < b) return -1
            if (a > b) return 1
            return 0
          })

        if (codes[0] === codes[1]) {
          minorUrbanAreaCode = codes[1]
          // remove one
        } else if (codes[0] === codes[1].replace(/^S/)) {
          minorUrbanAreaCode = codes[1]
          // remove without s
        } else {
          console.error(`${item.id} has ${item.claims[swedishMinorUrbanAreaCode].length} area codes`)
          dbItem.minorAreaCodeClaims = item.claims[swedishMinorUrbanAreaCode]
          dbItem.error = 'not one area code'
          return [dbItem]
        }
      } else if (item.claims[swedishMinorUrbanAreaCode].length !== 1) {
        console.error(`${item.id} has ${item.claims[swedishMinorUrbanAreaCode].length} area codes`)
        dbItem.minorAreaCodeClaims = item.claims[swedishMinorUrbanAreaCode]
        dbItem.error = 'not one area code'
        return [dbItem]
      }
      if (/^\d/.test(minorUrbanAreaCode)) {
        minorUrbanAreaCode = `S${minorUrbanAreaCode}`
      }

      const area = minorUrbanAreas[minorUrbanAreaCode]
      if (!area) {
        console.error(`minorUrbanArea ${minorUrbanAreaCode} on item ${item.id} not found`)
        dbItem.error = 'minorUrbanAreaCode missing'
        return [dbItem]
      }

      const changes = []

      dbItem.minorUrbanAreaCode = minorUrbanAreaCode

      checkLocatedIn(dbItem, item, area, changes)
      checkLabels(item, area, changes)
      checkPopulationClaims(dbItem, item, area, changes, referencesMinor)
      checkAreaClaims(dbItem, item, area, changes, referencesMinor)

      years.forEach(year => {
        checkPopulation(dbItem, item, area, year, changes, referencesMinor)
        checkArea(dbItem, item, area, year, changes, referencesMinor)
      })

      dbItem.edits = changes

      if (changes.length > 0) return (
        partition(changes, 6, changes =>
          // Promise.resolve(console.log(util.inspect(changes, {colors: true, depth: 10})))
          editEntity(item.id, changes).then(() => {
            console.log(`${item.id} updated`)
            dbItem.changed = true
          })
        )
          .then(() => dbItem)
      )
      else return [dbItem]
    })
    .flatMap((dbItem: DbItem) =>
      db.findOne({qid: dbItem.qid})
        .then(prevItem => {
          if (prevItem) {
            const edits = dbItem.edits
            delete dbItem.edits
            const updates = {$set: dbItem} as any
            if (edits && edits.length > 0) {
              updates.$push = {edits: {$each: edits}}
            }
            return db.update({qid: dbItem.qid}, updates)
          } else {
            return db.insert([dbItem])
          }
        })
    )
    .subscribe(
      () => {},
      error => {
        console.error('Error:', error, error.stack)
      },
      () => console.log('Done')
    )
}

main()
