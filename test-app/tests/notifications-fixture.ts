// Application feedback only; no wallet or ledger writes.
import {createNotifications} from '../src/notifications';
export function mountNotificationFixture(){
 const app=createNotifications();document.querySelector('.app-notifications:last-of-type')?.setAttribute('data-fixture','');
 return{app,dispose:()=>app.dismiss()};
}
