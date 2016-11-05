import {updateIn} from 'redux-decorated'
import {Area, Change, DbItem, WdItem} from './entities'
import {
  ItemValue,
  Reference,
  addClaim,
  addLabel,
  areaProperty,
  country,
  editClaim,
  itemSnak,
  locatedInTheAdministrative,
  newClaim,
  pointInTime,
  populationProperty,
  qualifier,
  quantitySnak,
  removeClaim,
  retrieved,
  statedIn,
  swedishMunicipalityCode,
  timeSnak,
} from './wikidata'

export const swedenNumeric = 34
export const sweden = `Q${swedenNumeric}`
export const hectareNumeric = 35852
export const hectare = `Q${hectareNumeric}`
export const hectareUrl = `http://www.wikidata.org/entity/${hectare}`
export const localities2010Numeric = 14907217
export const localities2010 = `Q${localities2010Numeric}`
export const statisticsDatabaseNumeric = 27579148
export const statisticsDatabase = `Q${statisticsDatabaseNumeric}`
export const statisticsDatabaseMinorNumeric = 27704297
export const statisticsDatabaseMinor = `Q${statisticsDatabaseMinorNumeric}`

const scbTime = {
  '60': timeSnak(pointInTime, '%2b1960-12-31T00:00:00Z'),
  '65': timeSnak(pointInTime, '%2b1965-12-31T00:00:00Z'),
  '70': timeSnak(pointInTime, '%2b1970-12-31T00:00:00Z'),
  '75': timeSnak(pointInTime, '%2b1975-12-31T00:00:00Z'),
  '80': timeSnak(pointInTime, '%2b1980-12-31T00:00:00Z'),
  '85': timeSnak(pointInTime, '%2b1985-12-31T00:00:00Z'),
  '90': timeSnak(pointInTime, '%2b1990-12-31T00:00:00Z'),
  '95': timeSnak(pointInTime, '%2b1995-12-31T00:00:00Z'),
  '00': timeSnak(pointInTime, '%2b2000-12-31T00:00:00Z'),
  '05': timeSnak(pointInTime, '%2b2005-12-31T00:00:00Z'),
  '10': timeSnak(pointInTime, '%2b2010-12-31T00:00:00Z'),
  '15': timeSnak(pointInTime, '%2b2015-12-31T00:00:00Z'),
}

// const years = ['90', '95', '00', '05', '10', '15']
// const years = ['90', '95', '00', '05', '10']
// const years = ['60', '65', '70', '75', '80']
export const years = ['60', '65', '70', '75', '80', '90', '95', '00', '05', '10']

export const mapTime = years.reduce((map, year) => {
  if (+year < 20) {
    map[`+20${year}-00-00T00:00:00Z`] = year
    map[`+20${year}-12-00T00:00:00Z`] = year
    map[`+20${year}-12-31T00:00:00Z`] = year
    map[`%2b20${year}-12-31T00:00:00Z`] = year
  } else {
    map[`+19${year}-00-00T00:00:00Z`] = year
    map[`+19${year}-12-00T00:00:00Z`] = year
    map[`+19${year}-12-31T00:00:00Z`] = year
    map[`%2b19${year}-12-31T00:00:00Z`] = year
  }
  return map
}, {
  '+2010-01-01T00:00:00Z': '10',
})

export const references = [
  {
    snaks: {
      [statedIn]: [itemSnak(statedIn, statisticsDatabaseNumeric)],
      [retrieved]: [timeSnak(retrieved, '%2b2016-11-01T00:00:00Z')],
    },
    'snaks-order': [
      statedIn,
      retrieved,
    ]
  }
]

export const referencesMinor = [
  {
    snaks: {
      [statedIn]: [itemSnak(statedIn, statisticsDatabaseMinorNumeric)],
      [retrieved]: [timeSnak(retrieved, '%2b2016-11-01T00:00:00Z')],
    },
    'snaks-order': [
      statedIn,
      retrieved,
    ]
  }
]

export function checkLocatedIn(dbItem: DbItem, item: WdItem, area: Area, changes: Change[]) {
  if (item.claims[locatedInTheAdministrative]) {
    dbItem.locatedInClaims = item.claims[locatedInTheAdministrative]
  }
  if (item.claims[swedishMunicipalityCode]) {
    dbItem.municipalityCodeClaims = item.claims[swedishMunicipalityCode]
  }

  if (!item.claims[country]) {
    console.error(`${item.id} has no country`)
    dbItem.error = 'no country'
    return [dbItem]
  } else if ((item.claims[country][0].mainsnak.datavalue as ItemValue).value.id != sweden) {
    console.error(`${item.id} is not in sweden`)
    dbItem.countryClaims = item.claims[country]
    dbItem.error = 'not in sweden'
    return [dbItem]
  }

  dbItem.name = area.name
  dbItem.municipailty = area.municipailty
}

export function checkLabels(item: WdItem, area: Area, changes: Change[]) {
  area.name = area.name.trim()

  if (area.name !== item.labels['sv'].value) {
    // console.error(`${item.id} differs in name ${area.name} and ${item.labels.sv.value}`)
    // dbItem.error = 'name differs'
    // return [dbItem]
  } else if (!item.labels['en']) {
    changes.push(addLabel('en', area.name))
  }
}

export function checkClaims(dbItem: DbItem, item: WdItem, area: Area, changes: Change[], property: string, name: string, references: Reference[], unit?: string) {
  if (item.claims[property]) {
    dbItem[`${name}Claims`] = item.claims[property]

    dbItem[`${name}Claims`].forEach(claim => {
      if (claim.qualifiers && Object.keys(claim.qualifiers).length > 1) {
        console.error(`${item.id} has too many ${name} qualifiers`)
        return
      }
      if (claim.references) {
        return
      }
      if (claim.qualifiers && claim.qualifiers[pointInTime]) {
        if (claim.qualifiers[pointInTime].length > 1) {
          console.error(`${item.id} has too many ${name} qualifiers`)
          return
        }
        const year = mapTime[claim.qualifiers[pointInTime][0].datavalue.value.time]
        if (!year) {
          console.error(`${item.id} Unknown year`, claim.qualifiers[pointInTime][0].datavalue.value.time)
          return
        }

        const value = area[name][year]

        if (value) {
          const claimQualifier =
            claim.qualifiers[pointInTime][0].datavalue.value.precision >= 11
              ? {property: pointInTime, snak: updateIn(
                  ['datavalue', 'value', 'time'],
                  scbTime[year].datavalue.value.time,
                  claim.qualifiers[pointInTime][0]
                )}
              : qualifier(pointInTime, scbTime[year])
          if (value != +claim.mainsnak.datavalue.value.amount) {
            console.error(`${item.id} diffrent ${name} ${value} and ${+claim.mainsnak.datavalue.value.amount}, updating`)
            changes.push(editClaim(claim, {
              mainsnak: quantitySnak(property, value, unit),
              references,
              qualifiers: [claimQualifier]
            }))
          } else {
            changes.push(editClaim(claim, {
              references,
              qualifiers: [claimQualifier]
            }))
          }
        }


      } else if (years.some(year => area[name][year])) {
        const existingYear = years.find(year => area[name][year] === +claim.mainsnak.datavalue.value.amount)
        item.claims[property] = item.claims[property].filter(c => c.id !== claim.id)
        if (existingYear) {
          const updatedClaim = editClaim(claim, {
            references,
            qualifiers: [qualifier(pointInTime, scbTime[existingYear])]
          })
          changes.push(updatedClaim)
          item.claims[property].push(updatedClaim.data)
        } else {
          changes.push(removeClaim(claim.id))
        }
      }
    })
  }
}

export function checkPopulationClaims(dbItem: DbItem, item: WdItem, area: Area, changes: Change[], references: Reference[]) {
  checkClaims(dbItem, item, area, changes, populationProperty, 'population', references)
}

export function checkAreaClaims(dbItem: DbItem, item: WdItem, area: Area, changes: Change[], references: Reference[]) {
  checkClaims(dbItem, item, area, changes, areaProperty, 'area', references, hectareUrl)
}

export function shouldAdd(item, year, property) {
  return !(item.claims[property] && item.claims[property].length) ||
    item.claims[property].every(claim =>
      claim.qualifiers && claim.qualifiers[pointInTime] && claim.qualifiers[pointInTime].length == 1 &&
      mapTime[claim.qualifiers[pointInTime][0].datavalue.value.time] &&
      mapTime[claim.qualifiers[pointInTime][0].datavalue.value.time] !== year
    )
}

export function checkPopulation(dbItem: DbItem, item: WdItem, area: Area, year: string, changes: Change[], references: Reference[]) {
  const populationValue = area.population[year]
  if (populationValue && shouldAdd(item, year, populationProperty)) {
    dbItem[`newPopulation${year}`] = populationValue
    changes.push(addClaim(newClaim(
      quantitySnak(populationProperty, populationValue),
      references,
      [qualifier(pointInTime, scbTime[year])]
    )))
  } else {
    if (!populationValue) {
      dbItem[`noPopulation${year}`] = true
      // console.error(`${item.id} has no population`)
    }
  }
}

export function checkArea(dbItem: DbItem, item: WdItem, area: Area, year: string, changes: Change[], references: Reference[]) {
  const areaValue = area.area[year]
  if (areaValue && shouldAdd(item, year, areaProperty)) {
    dbItem[`newArea${year}`] = areaValue
    changes.push(addClaim(newClaim(
      quantitySnak(areaProperty, areaValue, hectareUrl),
      references,
      [qualifier(pointInTime, scbTime[year])]
    )))
  } else {
    if (!areaValue) {
      dbItem[`noArea${year}`] = true
      // console.error(`${item.id} has no area`)
    }
    if (item.claims[areaProperty] && !dbItem.areaClaims) {
      dbItem.areaClaims = item.claims[areaProperty]
    }
  }
}
