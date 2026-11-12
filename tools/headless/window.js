// A plain maximised window with text, to have something behind the panel.
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({application_id: 'test.materialsearch.Window'});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({application: app, title: 'A window', default_width: 900, default_height: 600});
    const text = Array.from({length: 40}, (_, i) => `Line ${i + 1} of a document that lies behind the launcher, to see what shows through.`).join('\n');
    window.set_child(new Gtk.Label({label: text, xalign: 0, yalign: 0, margin_start: 360, margin_top: 140}));
    window.maximize();
    window.present();
});
app.run([]);
