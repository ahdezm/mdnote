#!/usr/bin/env node

// TODO: Add tag support
// TODO: Add check for dev token
// TODO: Add image support
// TODO: Add multimarkdown
// TODO: All math in one process
// TODO: Add arguments for math (http://shapeshed.com/command-line-utilities-with-nodejs/)
// TODO: Use Evernote API instead of applescript (http://dev.evernote.com/doc/articles/authentication.php)
// https://github.com/evernote/evernote-sdk-js/blob/master/sample/client/EDAMTest.js

var argv = require('yargs')
	.boolean('loadLatex')
	.boolean('m')
	.alias('m','meta')
	.describe('m','Strict meta information, must be delimited by a line of hyphens')
	.argv;

var fs = require('fs');
var through = require('through2');
var split = require('split');
var base64 = require("base64-stream");
var math = require("mathmode");

var marked = require('marked');
var renderer = new marked.Renderer();
var Evernote = require('evernote').Evernote;

var config = require('config.json');

var client = new Evernote.Client({token: config.devToken,sandbox:false});
var noteStore = client.getNoteStore();

marked.setOptions({
	renderer: new marked.Renderer(),
	gfm: true,
	tables: true,
	breaks: false,
	pedantic: false,
	sanitize: false,
	smartLists: true,
	smartypants: true
});

renderer.heading = function(text,level){
	return '<h' + level + '>' + text + '</h' + level + '>';
};

renderer.image = function(href,title,text){
	var out = '<img src="' + href + '" alt="' + text + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  out += this.options.xhtml ? '/>' : '>';
  out += '</img>';
  return out;
};

function readFile(path){
	var contents = [];
	var status = false;
	var meta = {
		title:false,
		tags:false,
		book:false
	};

	fs.createReadStream(path).pipe(split()).pipe(through(function(line,enc,done){
		line = line.toString();
		if(/^-+$/.test(line)){
			status = !status;
			done();
			return;
		}

		if(status || !argv.meta){
			if(!meta.title){
				var title = line.match(/^Title:\s(.*)|^#+(.+)/);
				if(!!title){ 
					meta.title = ((!!title && title[2])?(title[2]):(title[1])).trim();
					done();
					return;
				}
			}

			if(!meta.tags){
				var tags = line.match(/^(Tags:|@)\s(.*)/);
				if(!!tags){
					meta.tags = tags[2].split(',').map(function(tag){
						return tag.trim();
					});
					done();
					return;
				}
				
			}
			
			if(!meta.book){
				var book = line.match(/^(Notebook:|=)\s(.*)/);
				if(!!book){
					meta.book = book[2].trim();
					done();
					return;
				}
			}
		}

		if(line.length < 1){ line = '<br></br>'; }
		this.push(line);
		done();
	})).pipe(through(function(line,enc,done){
		var self = this;
		line = line.toString();

		var latex = line.match(/\$\$(.+)\$\$/);
		if(!!latex && latex.length > 0){
			if(argv.loadLatex){
				this.push(line.split(latex[0])[0] + '<img alt="' + latex[1] + '" src="http://latex.codecogs.com/gif.latex?' + encodeURI(latex[1]) + '"></img>' + line.split(latex[0])[1]);
				done();
			} else {
				this.push(line.split(latex[0])[0] + '<img alt="' + latex[1] + '" src="data:image/png;base64,');

				math(latex[1],{dpi:130}).pipe(base64.encode()).on('data',function(data){
					self.push(data);
				}).on('end',function(){
					self.push('"></img>' + line.split(latex[0])[1]);
					done();
				});	
			}
			
		} else {
			this.push(line);
			done();
		}
	})).on('data',function(line){
		contents.push(line);	
	}).on('end',function(){
		if(meta.book){
			noteStore.listNotebooks(function(err,notebooks){
				var book = notebooks.filter(function(self){
					return meta.book === self.name;
				});

				if(book.length > 0 && 'guid' in book[0]){
					meta.guid = book[0].guid;
				}
				createNote(meta,contents.join('\n'));
			});
		} else {
			createNote(meta,contents.join('\n'));
		}
		
	});
}

function createNote(meta,contents){
	var html = marked(contents,{renderer:renderer});
	meta.title = meta.title || new Date().toString();

	var note = new Evernote.Note();
	note.title = meta.title;
	note.notebookGuid = meta.guid || null;

	note.content = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">';
	note.content += '<en-note>' + html + '</en-note>';

	noteStore.createNote(note,function(err,note){
		if(err){
			console.log(err);
		}
	});
}

if(argv._.length === 1 && fs.existsSync(argv._[0])){
	readFile(argv._[0]);
}