function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
module.exports.wait = wait

function delay(ms, fn) {
  return data => wait(ms).then(() => fn(data))
}
module.exports.delay = delay
