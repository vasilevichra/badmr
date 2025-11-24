const { compile } = require('nexe');
const  copydir  = require('copy-dir');

const publicFilePath = './public/';
const destination = './dist/'

console.log('Start compile!');

compile({
  input: './app.js',
  output: `${destination}badmr`,
  target: 'linux-x64',
  //resources: `${publicFilePath}**/*` //This wil compile the assets into the exe file then the copy dir is not needed
  // build: true, //required to use patches
  // patches: [
  //   async (compiler, next) => {
  //     await compiler.setFileContentsAsync(
  //         'lib/new-native-module.js',
  //         'module.exports = 42'
  //     )
  //     return next()
  //   }
  // ]
}).then(() => {
  console.log('success')
// }).then(() => {
//   //when you compile the resources in the exe you dont need to copy them
//   copydir(publicFilePath, `${destination}/public`, e => console.log('copy done', e));
//   console.log('success')
}).catch((e) =>{
  console.log('Something is wrong :O :', e)
})