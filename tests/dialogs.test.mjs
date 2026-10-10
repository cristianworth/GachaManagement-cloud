import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDomHarness} from './helpers/domHarness.mjs';

test('Local SweetAlert2 renders shared dialogs with real buttons and text', async t => {
    const {dom,close}=createDomHarness();
    const keys=['HTMLElement','Element','HTMLInputElement','HTMLButtonElement','HTMLVideoElement','HTMLAudioElement','DOMParser','MutationObserver','getComputedStyle'];
    const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
    for(const key of keys)globalThis[key]=dom.window[key];
    dom.window.scrollTo=()=>{};
    t.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}close();});
    const {showDialog}=await import('../js/ui/dialogs.js');
    const {default:Swal}=await import('../js/vendor/sweetalert2/sweetalert2.esm.min.js');
    const pause=()=>new Promise(resolve=>setTimeout(resolve,120));
    await t.test('Shared notices render from local assets and treat supplied names as text',async()=>{
        const pending=showDialog({titleText:'Aviso',text:'<img src=x onerror=bad()>',animation:false});
        assert.equal(Swal.getContainer().parentElement,document.body);
        assert.equal(Swal.getTitle().innerText,'Aviso');
        assert.equal(Swal.getHtmlContainer().querySelector('img'),null);
        assert.match(Swal.getHtmlContainer().textContent,/<img/);
        assert.equal(Swal.getConfirmButton().textContent,'OK');
        Swal.getConfirmButton().click();assert.equal((await pending).isConfirmed,true);await pause();
    });
    await t.test('Confirmation stays inside the open native dialog; cancel and Escape preserve it',async()=>{
        const dialog=document.getElementById('taskBatchDialog');dialog.showModal();
        for(const escape of [false,true]){
            const pending=showDialog({titleText:'Recriar itens?',text:'Echo of War',showCancelButton:true,confirmButtonText:'Recriar itens',focusCancel:true,animation:false});
            assert.equal(Swal.getContainer().parentElement,dialog);
            assert.equal(Swal.getPopup().getAttribute('aria-modal'),'true');
            assert.equal(Swal.getConfirmButton().textContent,'Recriar itens');
            assert.equal(Swal.getCancelButton().textContent,'Cancelar');
            if(escape)dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));else Swal.getCancelButton().click();
            assert.equal((await pending).isConfirmed,false);await pause();
            assert.equal(dialog.open,true);assert.equal(dialog.querySelector('.swal2-container'),null);
        }
        dialog.close();
    });
    await t.test('Vendored assets exactly match the locked dependency',()=>{
        for(const [source,local] of [['dist/sweetalert2.esm.min.js','js/vendor/sweetalert2/sweetalert2.esm.min.js'],['dist/sweetalert2.min.css','css/sweetalert2.min.css'],['LICENSE','js/vendor/sweetalert2/LICENSE']])assert.deepEqual(readFileSync(new URL('../node_modules/sweetalert2/'+source,import.meta.url)),readFileSync(new URL('../'+local,import.meta.url)));
    });
});
