export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function delay(ms: number, fn) {
  return data => wait(ms).then(() => fn(data))
}

export function asMap<T>(array: T[], key: string): {[key: string]: T} {
  const map = Object.create(null)
  array.forEach(element => {
    map[element[key]] = element
  })
  return map
}

export function partition<T>(array: T[], batchSize: number, fn: (array: T[]) => Promise<any>) {
  if (array.length > batchSize) {
    const batch = array.slice(0, batchSize)
    const then = array.slice(batchSize)
    return fn(batch)
      .then(() => partition(then, batchSize, fn))
  } else {
    return fn(array)
  }
}
