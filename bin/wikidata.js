const FormData = require('form-data')
const fetch = require('fetch-cookie')(require('node-fetch'))
const {wait} = require('./helpers')

function mwFetch(action, params, form, skipAssert) {
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
      method: 'post',
      body: formData,
    }
  }

  let tries = 0
  function doFetch() {
    return fetch(`https://www.wikidata.org/w/api.php?${query}`, options)
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

function getToken(type) {
  return mwFetch('query', {meta: 'tokens', type}, undefined, true)
    .then(body => body.query.tokens[`${type}token`])
}

function login(username, password) {
  return getToken('login')
    .then(token => mwFetch('clientlogin', {_skipAssert: true, loginreturnurl: 'http://example.org/'}, {
      logintoken: token,
      username,
      password,
    }, true))
}
module.exports.login = login

// function getEntities(ids) {
//   return mwFetch('wbgetentities', {ids: ids.join('|')})
// }
function getEntity(id) {
  return mwFetch('wbgetentities', {ids: id})
    .then(body => body.entities[id])
}
module.exports.getEntity = getEntity
function editEntity(id, claims) {
  return getToken('csrf')
    .then(token => mwFetch('wbeditentity', {id, data: JSON.stringify({claims})}, {
      token,
    }))
}
module.exports.editEntity = editEntity

function itemSnak(property, numericId) {
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
module.exports.itemSnak = itemSnak

function quantitySnak(property, value, unit = 1) {
  value = Math.round(value)
  return {
    'snaktype': 'value',
    property,
    'datavalue': {
      'value': {
        'amount': value,
        'unit': `${unit}`,
        'upperBound': value + 1,
        'lowerBound': value - 1,
      },
      'type': 'quantity'
    },
  }
}
module.exports.quantitySnak = quantitySnak

function timeSnak(property, time, timezone = 1) {
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
module.exports.timeSnak = timeSnak

function claim(mainsnak, references, qualifiers = []) {
  return {
    mainsnak,
    'type': 'statement',
    'rank': 'normal',
    'qualifiers': qualifiers.reduce((qualifiers, qualifier) => {
      qualifiers[qualifier.property] = [qualifier.snak]
      return qualifiers
    }, {}),
    'qualifiers-order': qualifiers.map(q => q.property),
    references,
  }
}
module.exports.claim = claim

function qualifier(property, snak) {
  return {property, snak}
}
module.exports.qualifier = qualifier
