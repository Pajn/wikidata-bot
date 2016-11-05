export const areasWithoutPopulation = `
 SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item wdt:P775 ?areaCode .

  FILTER (!isBlank(?areaCode)) .
  FILTER NOT EXISTS {
    ?item wdt:P1082 ?population .
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
  }
 }
`

export const minorAreasWithoutPopulation = `
 SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item wdt:P776 ?areaCode .

  FILTER (!isBlank(?areaCode)) .
  FILTER NOT EXISTS {
    ?item wdt:P1082 ?population .
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
  }
 }
`

export const areasWithoutArea = `
 SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item wdt:P775 ?areaCode .

  FILTER (!isBlank(?areaCode)) .
  FILTER NOT EXISTS {
    ?item wdt:P2046 ?area .
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
  }
 }
`

export const populationWithoutReferences = `
  SELECT DISTINCT ?item ?itemLabel WHERE {
    ?item p:P1082 ?population_statement .
    ?item wdt:P775 ?areaCode .

    FILTER (!isBlank(?areaCode)) .
    FILTER NOT EXISTS {
      ?population_statement	prov:wasDerivedFrom ?ref .
    }

    SERVICE wikibase:label {
      bd:serviceParam wikibase:language "en" .
    }
  }
`

export const areaWithoutReferences = `
  SELECT DISTINCT ?item ?itemLabel WHERE {
    ?item p:P2046 ?area_statement .
    ?item wdt:P775 ?areaCode .

    FILTER (!isBlank(?areaCode)) .
    FILTER NOT EXISTS {
      ?area_statement	prov:wasDerivedFrom ?ref .
    }

    SERVICE wikibase:label {
      bd:serviceParam wikibase:language "en" .
    }
  }
`
