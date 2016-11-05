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
  references,
  years
} from './area-helpers'
import * as data from './data'
import {DbItem, WdItem, Change, Area} from './entities'
import {asMap, delay, partition} from './helpers'
import * as queries from './queries'
import {
  Claim,
  QuantitySnak,
  QuantityValue,
  addClaim,
  addLabel,
  editClaim,
  editEntity,
  getEntity,
  itemSnak,
  login,
  newClaim,
  qualifier,
  quantitySnak,
  removeClaim,
  sparqlQuery,
  swedishUrbanAreaCode,
  timeSnak,
} from './wikidata'
Error.stackTraceLimit = 500

function main() {
  const urbanAreas = data.getUrbanAreas()
  const db = datastore({
    filename: 'db.json',
    autoload: true,
  })

  // return db.find({'labels': {$exists: true}, 'labels.en': {$exists: false}})
  //   .then(a => console.log(a))

  Rx.Observable.fromPromise(db.ensureIndex({fieldName: 'qid', unique: true}))
    .flatMap(() => Rx.Observable.fromPromise(login(data.credentials.user, data.credentials.password)))
    // .flatMap(() => Rx.Observable.from(itemsWithoutArea))
    // .flatMap(() => Rx.Observable.of('Q3335533'))
    // .flatMap(() => db.find({'labels': {$exists: true}, 'labels.en': {$exists: false}}))
    // .flatMap(items => items)
    // .map(item => item.qid)
    // .flatMap(() => sparqlQuery(queries.areaWithoutReferences))
    // .flatMap(body => body.results.bindings.map(item => ({
    //   qid: item.item.value.replace(/.*?\/(Q[0-9]+)$/, '$1'),
    //   name: item.itemLabel.value,
    // })))
    // .map(item => item.qid)
    .skip(0)
    // .take(1)
    // Change the delay
    .concatMap(delay(1000, getEntity))
    .concatMap(item => {
      const dbItem: DbItem = {
        qid: item.id,
        labels: item.labels,
        descriptions: item.descriptions,
        correctedReferences: true,
        urban: true,
      }

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
          dbItem.areaCodeClaims = item.claims[swedishUrbanAreaCode]
          dbItem.error = 'not one area code'
          return [dbItem]
        }
      } else if (item.claims[swedishUrbanAreaCode].length !== 1) {
        console.error(`${item.id} has ${item.claims[swedishUrbanAreaCode].length} area codes`)
        dbItem.areaCodeClaims = item.claims[swedishUrbanAreaCode]
        dbItem.error = 'not one area code'
        return [dbItem]
      }
      if (/^\d/.test(urbanAreaCode)) {
        urbanAreaCode = `T${urbanAreaCode}`
      }

      const urbanArea = urbanAreas[urbanAreaCode]
      if (!urbanArea) {
        console.error(`urbanArea ${urbanAreaCode} on item ${item.id} not found`)
        dbItem.error = 'urbanArea missing'
        return [dbItem]
      }

      const area = urbanArea
      area.name = area.name.trim()
      const changes = []

      dbItem.urbanAreaCode = urbanAreaCode

      checkLocatedIn(dbItem, item, area, changes)
      checkLabels(item, area, changes)
      checkPopulationClaims(dbItem, item, area, changes, references)
      checkAreaClaims(dbItem, item, area, changes, references)

      years.forEach(year => {
        checkPopulation(dbItem, item, area, year, changes, references)
        checkArea(dbItem, item, area, year, changes, references)
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
