import {updateIn} from 'redux-decorated'
import {Change} from './entities'
import {wait} from './helpers'
const FormData = require('form-data')
const fetch = require('fetch-cookie')(require('node-fetch'))

type StringMap = {[key: string]: string}
type JsonObject = {[key: string]: boolean|string}

function mwFetch(url, options?: {method?: 'get'|'post', headers?: StringMap, body?: any}) {
  let tries = 0
  function doFetch() {
    return fetch(url, options)
      .then(r => {
        tries++
        const retryAfter = r.headers.getAll('Retry-After')
        if (retryAfter.length) {
          const time = (+retryAfter[0]) * 1000
          return wait(time).then(doFetch)
        } else if (! r.ok) {
          if (tries > 10) r.text().then(text => { throw `Error after 10 tries: ${text}` })
          return wait(10000).then(doFetch)
        }
        return r.json()
          .then(body => {
            if (body.error) throw body.error
            return body
          })
      })
  }

  return doFetch()
}

function mwAction(action: string, params: StringMap, form?: JsonObject, skipAssert?: boolean) {
  let query = `action=${action}&format=json&maxlag=5&bot=true`
  if (!skipAssert) {
    query += `&assertuser=PajnBot&assert=bot` // bot
  }
  Object.keys(params).forEach(key => {
    query += `&${key}=${params[key]}`
  })
  let options
  if (form) {
    const formData = new FormData()
    Object.keys(form).forEach(key => {
      formData.append(key, form[key])
    })
    options = {
      method: 'post' as 'post',
      body: formData,
    }
  }

  return mwFetch(`https://www.wikidata.org/w/api.php?${query}`, options)
}

function getToken(type) {
  return mwAction('query', {meta: 'tokens', type}, undefined, true)
    .then(body => body.query.tokens[`${type}token`])
}

export function login(username, password) {
  return getToken('login')
    .then(token => mwAction('clientlogin', {_skipAssert: 'true', loginreturnurl: 'http://example.org/'}, {
      logintoken: token,
      username,
      password,
    }, true))
}

export function getEntities(ids) {
  return mwAction('wbgetentities', {ids: ids.join('|')})
}
export function getEntity(id) {
  return mwAction('wbgetentities', {ids: id})
    .then(body => body.entities[id])
}
export function searchEntities(search, language = 'en') {
  return mwAction('wbsearchentities', {search, language})
}
export function editEntity(id, edits) {
  if (edits.length === 0) return Promise.resolve()
  const changes: {labels?: any[], claims?: any[]} = {}
  edits.forEach(edit => {
    if (edit.type === 'label') {
      if (!changes.labels) changes.labels = []
      changes.labels.push(edit.data)
    }
    else if (edit.type === 'claim') {
      if (!changes.claims) changes.claims = []
      changes.claims.push(edit.data)
    }
  })
  return getToken('csrf')
    .then(token => mwAction('wbeditentity', {id, data: JSON.stringify(changes)}, {
      token,
    }))
}

export function sparqlQuery(query) {
  query = encodeURIComponent(query.replace(/(\s)\s+/g, '$1'))
  return mwFetch(`https://query.wikidata.org/sparql?query=${query}&format=json`)
}

export const country = 'P17'
export const locatedInTheAdministrative = 'P131'
export const statedIn = 'P248'
export const swedishMunicipalityCode = 'P525'
export const pointInTime = 'P585'
export const swedishUrbanAreaCode = 'P775'
export const swedishMinorUrbanAreaCode = 'P776'
export const retrieved = 'P813'
export const referenceUrl = 'P854'
export const populationProperty = 'P1082'
export const areaProperty = 'P2046'

export type ItemValue = {
  type: 'wikibase-entityid'
  value: {
    id?: string
    'entity-type': 'item'
    'numeric-id': number
  }
}
export type QuantityValue = {
  type: 'quantity'
  value: {
    amount: number
    unit: string
    upperBound: number
    lowerBound: number
  }
}
export type TimeValue = {
  type: 'time'
  value: {
    time: string
    timezone: number
    before: number
    after: number
    precision: number
    calendarmodel: 'http://www.wikidata.org/entity/Q1985727'
  }
}
export type Snak = {
  snaktype: 'value'
  property: string
  datatype?: string
  datavalue: ItemValue|QuantityValue|TimeValue
}
export type ItemSnak = {
  snaktype: 'value'
  property: string
  datatype: 'item'
  datavalue: ItemValue
}
export type QuantitySnak = {
  snaktype: 'value'
  property: string
  datatype: 'quantity'
  datavalue: QuantityValue
}
export type TimeSnak = {
  snaktype: 'value'
  property: string
  datatype: 'time'
  datavalue: TimeValue
}
export type Qualifier = {property: string, snak: Snak}
export type NewQualifier = {property: string, snak: Snak}
export type Reference = {
  snaks: {[property: string]: Snak[]}
  'snaks-order': string[]
}
export type CreatedClaim = {
  mainsnak: ItemSnak|QuantitySnak|TimeSnak
  type: 'statement'
  rank: 'normal'|'preffered'
  qualifiers: {
    P585: TimeSnak[]
    [property: string]: Snak[]
  }
  'qualifiers-order': string[]
  references: Reference[]
}
export type Claim = CreatedClaim & {id: string}
export type NewClaim = {
  mainsnak?: Snak
  type?: 'statement'
  rank?: 'normal'|'preffered'
  qualifiers?: NewQualifier[]
  'qualifiers-order'?: string[]
  references?: Reference[]
}

export function itemSnak(property, numericId): Snak {
  return {
    'snaktype': 'value',
    property,
    'datavalue': {
      'value': {
        'entity-type': 'item',
        'numeric-id': numericId,
      },
      'type': 'wikibase-entityid'
    },
  }
}

export function quantitySnak(property, value, unit = '1', upper = value + 1, lower = value - 1): Snak {
  value = Math.round(value)
  return {
    'snaktype': 'value',
    property,
    'datavalue': {
      'value': {
        'amount': value,
        'unit': unit,
        'upperBound': upper,
        'lowerBound': lower,
      },
      'type': 'quantity'
    },
  }
}

export function timeSnak(property: string, time: string, timezone = 1): Snak {
  return {
    'snaktype': 'value',
    property,
    'datavalue': {
      'value': {
        time,
        timezone,
        'before': 0,
        'after': 0,
        'precision': 11,
        'calendarmodel': 'http://www.wikidata.org/entity/Q1985727'
      },
      'type': 'time'
    },
  }
}

export function newClaim(mainsnak: Snak, references: Reference[], qualifiers: Qualifier[] = []): CreatedClaim {
  return {
    mainsnak: mainsnak as any,
    'type': 'statement',
    'rank': 'normal',
    'qualifiers': qualifiers.reduce((qualifiers, qualifier) => {
      qualifiers[qualifier.property] = [qualifier.snak]
      return qualifiers
    }, {} as any),
    'qualifiers-order': qualifiers.map(q => q.property),
    references,
  }
}

export function qualifier(property: string, snak: Snak) {
  return {property, snak}
}

export function addLabel(language: string, value: string): Change {
  return {type: 'label', data: {language, value, add: ''}}
}

export function addClaim(claim: CreatedClaim): Change {
  return {type: 'claim', data: claim}
}

export function editClaim(oldClaim: Claim, claim: NewClaim): Change {
  delete claim.type
  delete claim.rank
  const data = Object.assign({}, oldClaim, claim) as Claim
  if (claim.qualifiers) {
    data.qualifiers = claim.qualifiers.reduce((qualifiers, qualifier) => {
      qualifiers[qualifier.property] = [qualifier.snak]
      return qualifiers
    }, {} as any)
    data['qualifiers-order'] = claim.qualifiers.map(q => q.property)
  } else if (oldClaim.qualifiers && oldClaim.qualifiers['P585']) {
    data.qualifiers = updateIn(
      'P585',
      oldClaim.qualifiers['P585'].map(qualifier => updateIn(
        ['datavalue', 'value', 'time'],
        (qualifier.datavalue as TimeValue).value.time.replace('+', '%2b'),
        qualifier
      )),
      oldClaim.qualifiers
    )
  }
  if (!claim.mainsnak) {
    if (oldClaim.mainsnak.datatype === 'quantity') {
      data.mainsnak = quantitySnak(
        oldClaim.mainsnak.property,
        +oldClaim.mainsnak.datavalue.value.amount,
        oldClaim.mainsnak.datavalue.value.unit,
        +oldClaim.mainsnak.datavalue.value.upperBound,
        +oldClaim.mainsnak.datavalue.value.lowerBound
      ) as QuantitySnak
    } else {
      throw `Can't edit ${oldClaim.mainsnak.datatype}`
    }
  }
  return {type: 'claim', data}
}

export function replaceClaim(id: string, claim: Claim): Change {
  return {type: 'claim', data: Object.assign({id}, claim)}
}

export function removeClaim(id: string): Change {
  return {type: 'claim', data: {id, remove: ''}}
}
