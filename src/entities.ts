import {Claim, CreatedClaim} from './wikidata'

export type DbItem = {
  qid: string
  labels: any
  descriptions: any
  correctedReferences?: true
  urban?: true
  minor?: true
  areaClaims?: Claim[]
  areaCodeClaims?: Claim[]
  minorAreaCodeClaims?: Claim[]
  locatedInClaims?: Claim[]
  municipalityCodeClaims?: Claim[]
  countryClaims?: Claim[]
  urbanAreaCode?: string
  minorUrbanAreaCode?: string
  error?: string
  name?: string
  municipailty?: string
  edits?: any[]
  changes?: any[]
  changed?: boolean
}
export type WdItem = {
  id: string
  labels: {[lang: string]: {value: string}}
  claims: {[property: string]: Claim[]}
}
export type LabelChange = {type: 'label', data: any}
export type RemovedClaim = {id: string, remove: string}
export type ClaimChange = {type: 'claim', data: CreatedClaim|RemovedClaim}
export type Change = LabelChange|ClaimChange
export type Area = {
  name: string
  code: string
  municipailty: string
  population: {
    [year: string]: number|null
  }
  area: {
    [year: string]: number|null
  }
}
