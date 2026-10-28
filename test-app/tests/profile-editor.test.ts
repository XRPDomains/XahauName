import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProfileEdit} from '../src/profile-editor';
import {profileFieldForms} from '../src/views';
import {PROFILE_TEXT_KEYS} from '../../packages/sdk/src/protocol';

const blanks=()=>Object.fromEntries(PROFILE_TEXT_KEYS.map(key=>[key,'']));
test('a first bio can be saved with all nine other profile fields empty',()=>{
 const result=evaluateProfileEdit('alice.xah',{}, {...blanks(),description:'My first bio'});
 assert.deepEqual(result,{patch:{set:{description:'My first bio'},clear:[]},errors:{}});
});
test('incremental edits preserve untouched records including legacy nonconforming values',()=>{
 const current={display:'Alice',phone:'123',email:'old@example.com','custom.note':'keep'};
 const result=evaluateProfileEdit('alice.xah',current,{...blanks(),display:current.display,phone:current.phone,email:current.email,description:'A bio'});
 assert.deepEqual(result,{patch:{set:{description:'A bio'},clear:[]},errors:{}});assert.equal(current['custom.note'],'keep');
});
test('display accepts personal names with spaces, Unicode and mixed case',()=>{
 const result=evaluateProfileEdit('myname.xah',{}, {...blanks(),description:'Bio',display:'Nguyễn Alice'});
 assert.deepEqual(result.errors,{});assert.equal(result.patch.set.display,'Nguyễn Alice');
 assert.deepEqual(evaluateProfileEdit('myname.xah',{}, {...blanks(),description:'Bio'}).errors,{});
 assert.deepEqual(evaluateProfileEdit('myname.xah',{}, {display:'MyName.xah'}).errors,{});
});
test('blank or whitespace-only optional fields do not become invalid set operations',()=>{
 assert.deepEqual(evaluateProfileEdit('alice.xah',{},blanks()),{patch:{set:{},clear:[]},errors:{}});
 assert.deepEqual(evaluateProfileEdit('alice.xah',{}, {description:'Bio',display:'  ',phone:'\t'}),{patch:{set:{description:'Bio'},clear:[]},errors:{}});
});
test('removing one existing field is explicit and does not clear unrelated records',()=>{
 const current={description:'Bio',email:'old@example.com','custom.note':'keep'};
 assert.deepEqual(evaluateProfileEdit('alice.xah',current,{description:'Bio',email:' \n '}),{patch:{set:{},clear:['email']},errors:{}});
});
test('rendered profile uses an optional personal name and neutral international phone placeholder',()=>{
 const html=profileFieldForms({},true,'myname.xah');
 assert(html.includes('>Display name</label>'));assert(html.includes('placeholder="Your name"'));
 assert(!html.includes('Capitalization only'));assert(html.includes('id="profile-error-display"'));
 assert(html.includes('placeholder="+ [country code] [phone number]"'));assert(!html.includes('+84'));
 assert(!/\brequired(?:\s|[=>])/.test(html));assert(!html.includes('value="myname.xah"'));
});
