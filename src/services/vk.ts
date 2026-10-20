import { VK, CallbackService } from 'vk-io';
import * as auth from '@vk-io/authorization';

// const direct = new DirectAuthorization({
//   callbackService,
//
//   scope: 'all',
//
//   // Direct authorization is only available for official applications
//   ...officialAppCredentials.android, // { clientId: string; clientSecret: string; }
//
//   // Or manually provide app credentials
//   // clientId: process.env.CLIENT_ID,
//   // clientSecret: process.env.CLIENT_SECRET,
//
//   login: process.env.LOGIN,
//   password: process.env.PASSWORD,
//
//   apiVersion: '5.199'
// });
//
// async function run() {
//   const response = await direct.run();
//
//   console.log('Token:', response.token);
//   console.log('Expires:', response.expires);
//
//   console.log('Email:', response.email);
//   console.log('User ID:', response.userId);
// }
//
// run().catch(console.error);

class Vk {
  declare static _instance: Vk | undefined;
  options!: {
    callbackService: InstanceType<typeof CallbackService>;
    scope: string;
    clientId: string;
    clientSecret: string;
    login: string;
    password: string;
    apiVersion: string;
  };
  direct!: auth.ImplicitFlowUser;

  constructor() {
    if (Vk._instance) {
      return Vk._instance;
    }
    Vk._instance = this;

    // this.auth = new DirectAuthorization({
    //   callbackService: new CallbackService(),
    //
    //   scope: 'all',
    //
    //   // Direct authorization is only available for official applications
    //   // ...officialAppCredentials.android, // { clientId: string; clientSecret: string; }
    //
    //   // Or manually provide app credentials
    //   // clientId: process.env.CLIENT_ID,
    //   // clientSecret: process.env.CLIENT_SECRET,
    //   //
    //   // login: process.env.LOGIN,
    //   // password: process.env.PASSWORD,
    //
    //
    //   apiVersion: '5.199'
    // });

    // this.vk = new VK({
    //   appId: 54484897,
    //   appSecret: 'RoJc5QCutQwN5el2j2m8',
    //   login: 651677,
    //   password: 'hjvfirf123V7',
    //   authScope: 'all'
    // });

    this.options = {
      callbackService: new CallbackService(),
      scope: 'all',
      clientId: '54484897',
      clientSecret: 'fb1b1a74fb1b1a74fb1b1a7435f82445d5ffb1bfb1b1a7492adc624e3c90c50fafc526c',
      login: 'vasilevich@gmail.com',
      password: 'hjvfirf123V7',
      apiVersion: '5.131'
    };

    this.direct = new auth.ImplicitFlowUser(this.options);

  }

  // run = () => this.direct.run().then((response) => {
  //   console.log(response.token); // выводится, все супер
  // })
  // .then(r => {
  //   console.log(vk.token); // null !!!
  // })
  // .catch(error => console.log(error));

  async run() {

  }

  // {
  //   const response = this.auth.run();
  //
  //   console.log('Token:', response.token);
  //   console.log('Expires:', response.expires);
  //
  //   console.log('Email:', response.email);
  //   console.log('User ID:', response.userId);
  // }

  // async function run() {
  //   const response = await direct.run();
  //
  //   console.log('Token:', response.token);
  //   console.log('Expires:', response.expires);
  //
  //   console.log('Email:', response.email);
  //   console.log('User ID:', response.userId);
  // }
}

export default Vk;