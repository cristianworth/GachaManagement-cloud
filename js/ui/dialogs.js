import Swal from '../vendor/sweetalert2/sweetalert2.esm.min.js';

// Keep popups inside an open native dialog so they remain visible in its top layer.
export function showDialog(options = {}) {
    const {customClass, ...settings} = options;
    return Swal.fire({
        target: document.querySelector('dialog[open]') ?? document.body,
        heightAuto: false,
        keydownListenerCapture: true,
        allowOutsideClick: false,
        buttonsStyling: false,
        confirmButtonText: 'OK',
        cancelButtonText: 'Cancelar',
        customClass: {
            popup: 'app-dialog-popup',
            title: 'app-dialog-title',
            htmlContainer: 'app-dialog-text',
            confirmButton: 'button-save',
            cancelButton: 'button-neutral',
            ...customClass,
        },
        ...settings,
    });
}
