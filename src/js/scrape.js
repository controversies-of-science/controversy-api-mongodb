'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

// TODO: Consider just dropping table every time, then recreating.
// TODO: Refactor to also update mLab database

var Db = require('mongodb').Db,
    Server = require('mongodb').Server,
    MongoClient = require('mongodb').MongoClient,
    fs = require('fs'),
    request = require('request'),
    slugify = require('slugify'),
    execSync = require('child_process').execSync,
    ObjectId = require('mongodb').ObjectId,
    Thumbnail = require('thumbnail'),
    GPlus = require('./gplus').default,
    loadJsonFile = require('load-json-file'),
    port = 27017,
    host = "localhost",
    dbName = "controversies",
    url = 'mongodb://' + host + ':' + port + '/' + dbName,
    assert = require('assert'),
    METACARDS = 'metacards',
    CARDS = 'cards',
    prototypeObjectId = '58b8f1f7b2ef4ddae2fb8b17',
    cardImageDirectory = 'img/cards/',
    feedImageDirectories = ['img/feeds/halton-arp-the-modern-galileo/worldview/', 'img/feeds/halton-arp-the-modern-galileo/model/', 'img/feeds/halton-arp-the-modern-galileo/propositional/', 'img/feeds/halton-arp-the-modern-galileo/conceptual/', 'img/feeds/halton-arp-the-modern-galileo/narrative/'],
    prototypeJSON = 'json/halton-arp.json',
    algoliaJSON = 'json/algolia.json',
    feedThumbnailSize = 506;

var db = null,
    combinedJSON = [],
    allFeedImages = [],
    gplusMetacards = void 0,
    // Controversy card metadata from G+
mongoMetacards = void 0,
    // Mongo DB metacards reference
mongoCards = void 0,
    savedCount = void 0,
    mongoMetadata = void 0,
    shouldScrape = false,
    prototypeCard = void 0;

function create() {
	return new Promise(function (resolve, reject) {
		resolve(new Db(dbName, new Server(host, port)));
	});
}

function open() {
	return new Promise(function (resolve, reject) {
		MongoClient.connect(url, function (err, database) {
			if (err) {
				reject(err);
			} else {
				resolve(database);
			}
		});
	});
}

// Slugify controversy card titles, lower the casing, then remove periods and apostrophes
function createSlug(cardName) {
	var slugInitial = slugify(cardName),
	    slugLower = slugInitial.toLowerCase(),
	    slugFinal = slugLower.replace(/['.]/g, '');

	return slugFinal;
}

function saveImage(url, destination, resolve, reject) {
	request.get({ url: url, encoding: 'binary' }, function (err, response, body) {
		fs.writeFile(destination, body, 'binary', function (err) {
			if (err) {
				reject(err);
			} else {
				console.log(destination + ' successfully saved.');
				resolve();
			}
		});
	});
}

// TODO: Rename resulting file to thumbnail.jpg
function createThumbnail(input, output, isAlreadyGenerated) {
	return new Promise(function (resolve, reject) {
		if (isAlreadyGenerated) {
			console.log('Thumbnail already generated for ' + input);
			resolve();
		} else {
			var thumbnail = new Thumbnail(input, output);

			thumbnail.ensureThumbnail('large.jpg', feedThumbnailSize, feedThumbnailSize, function (err, filename) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		}
	});
}

function removeSystemFiles(list) {
	return list.filter(function (el) {
		return !el.match(/\.DS_Store/);
	});
}

function close(db) {
	if (db) {
		db.close();
	}
}

function scrapeCollection(resolve, reject) {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	var gplus = new GPlus();
	gplus.init();

	// Recursive promise chain to deal with API pagination
	// GPlus class handles aggregation of data
	var getPage = function getPage() {
		gplus.scrapeCards().then(function (data) {
			// Send back an array of the card titles which have been added
			if (gplus.nextPageToken && gplus.more) {
				getPage();
			} else {
				console.log('\nScrape Results:\n');
				console.log([].concat(_toConsumableArray(gplus.titlesAdded)));

				resolve(gplus.getCollection());
			}
		}).catch(function (data) {
			console.log("\nAlthough keys do indeed exist to access the G+ API, either the keys are invalid or the request has failed. If you wish to proceed without scraping the G+ API, consider removing the keys from your environment variables.");
			console.log("Status Code: " + data.statusCode);
			console.log("Error: " + data.error);

			reject();
		});
	};

	getPage();
}

create().then(function () {
	return open();
})

// Check that G+ API keys exist
.then(function (database) {
	db = database;
	shouldScrape = GPlus.keysExist();

	return database;
})

// Save a reference to the metacards MongoDB collection
.then(function (database) {
	return new Promise(function (resolve, reject) {
		resolve(db.collection(METACARDS));
	});
})

// Save all controversy card data from G+ collection
.then(function (collection) {
	mongoMetacards = collection;

	console.log("\nChecking for Google+ API Keys in local environment.");

	return new Promise(function (resolve, reject) {
		if (!shouldScrape) {
			console.log("\nNo keys found, will not scrape metadata.");

			resolve(null);
		} else {
			console.log("\nScraping G+ Collection.");

			scrapeCollection(resolve, reject);
		}
	});
})

// Get the current number of controversy cards in MongoDB
.then(function (collection) {
	gplusMetacards = collection;

	return new Promise(function (resolve, reject) {
		resolve(mongoMetacards.count());
	});
})

// Grab the metadata which has been manually typed in for each controversy card
.then(function (count) {
	savedCount = count;

	return new Promise(function (resolve, reject) {
		fs.readFile('json/metacards.json', 'utf8', function (err, cards) {
			if (err) {
				reject(err);
			} else {
				resolve(JSON.parse(cards));
			}
		});
	});
})

// Compose hardcoded JSON and G+ collection controversy card data into a single object, combinedJSON
.then(function (JSONCards) {
	return new Promise(function (resolve, reject) {
		if (savedCount === 0 && shouldScrape) {

			console.log("\nThere are currently " + savedCount + " metacards in the controversies collection.");
			console.log("\nSaving Scraped data to MongoDB");

			gplusMetacards.forEach(function (gplusCard) {
				var slug = createSlug(gplusCard.name),
				    json = JSONCards.filter(function (el) {
					return el.slug === slug ? true : false;
				});

				combinedJSON.push(Object.assign({}, gplusCard, json[0]));
			});

			resolve(mongoMetacards.insertMany(combinedJSON));
		} else if (gplusMetacards && gplusMetacards.length > savedCount) {

			console.log("\nThere are currently " + savedCount + " metacards in the controversies collection.");
			console.log("\nThere are new G+ posts since last scrape.");
			resolve();
		} else if (gplusMetacards && gplusMetacards.length === savedCount) {

			console.log("\nThere are no new G+ posts since last scrape.");
			resolve();
		} else if (!shouldScrape) {

			console.log("\nWill set up backend without G+ metadata.  See README for more information.");
			resolve();
		}
	});
})

// Export that composed object to a JSON file, for importing into Algolia search service
.then(function () {
	return new Promise(function (resolve, reject) {
		if (combinedJSON) {
			console.log('\nExporting the combined JSON to ' + algoliaJSON + '\n');

			fs.writeFile(algoliaJSON, JSON.stringify(combinedJSON), 'utf-8', function (err) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		} else {
			console.log('\nSkipping the export of the combined JSON because it is empty.\n');
		}
	});
})

// Check number of controversy cards in MongoDB post-save
.then(function () {
	return new Promise(function (resolve, reject) {
		resolve(mongoMetacards.count());
	});
})

// Load the Halton Arp hardcoded JSON for the animated infographic
.then(function (count) {
	savedCount = count;

	console.log("\nThere are now " + savedCount + " metacards in the controversies collection.");
	console.log("\nNow adding prototype card data for Halton Arp controversy card.");
	console.log("(Note that any trailing commas within the JSON may cause an 'Invalid property descriptor' error.)");

	return new Promise(function (resolve, reject) {
		resolve(loadJsonFile(prototypeJSON));
	});
})

// Get reference to the prototype data in MongoDB
.then(function (json) {
	// Fix the prototype ObjectId
	prototypeCard = Object.assign({}, json, { "_id": new ObjectId(prototypeObjectId) });

	return new Promise(function (resolve, reject) {
		resolve(db.collection(CARDS));
	});
})

// Count number of cards stored in MongoDB prototype dataset
.then(function (collection) {
	mongoCards = collection;

	return new Promise(function (resolve, reject) {
		resolve(mongoCards.count());
	});
})

// Observe that it's necessary to delete existing cards data in MongoDB before it will save
// mongo --> use controversies; --> db.cards.drop();
.then(function (count) {
	return new Promise(function (resolve, reject) {
		if (count === 0) {
			console.log("\nThere is no prototype controversy card to test frontend with.  Adding.");

			resolve(mongoCards.insertOne(prototypeCard));
		} else {
			console.log("\nThe prototype controversy card has already been added.");

			resolve();
		}
	});
})

// Get all controversy card data from MongoDB
.then(function () {
	return db.collection(METACARDS).find({}).map(function (x) {
		return {
			'image': x.image,
			'name': x.name,
			'thumbnail': x.thumbnail,
			'url': x.url,
			'text': x.text };
	}).toArray();
})

// create directory from card id, download and save image into that directory, then rename that file to large.jpg

// WARNING: It's a good idea to double-check that the images are valid images after saving.  Note as well that the Google API does not always serve a high-quality image, so they must sometimes be manually downloaded (Really dumb).
.then(function (cards) {
	mongoMetadata = cards;

	console.log('\nSaving images to local directory. I recommend checking the images afterwards to make sure that the downloads were all successful. The scrape script appears to require a couple of scrapes to fully download all of them, probably due to the large amount of image data ...\n');

	var promiseArray = cards.map(function (card) {
		return new Promise(function (resolve, reject) {

			var slug = createSlug(card.name),
			    imageDirectory = cardImageDirectory + slug;

			// Check if we have read/write access to the directory
			fs.access(imageDirectory, fs.constants.R_OK | fs.constants.W_OK, function (access_err) {

				// Slug-named directory does not exist
				if (access_err) {
					fs.mkdir(imageDirectory, function (mkdir_err, folder) {
						if (mkdir_err) {
							reject(mkdir_err);
						} else {
							saveImage(card.image, imageDirectory + '/large.jpg', resolve, reject);
						}
					});

					// Directory exists ...
				} else {
					fs.readdir(imageDirectory, function (readdir_err, files) {

						if (readdir_err) {
							reject(readdir_err);
						}

						removeSystemFiles(files);

						// ... but there is no image file
						if (files.length === 0) {
							console.log('Saving image ' + imageDirectory + '...');
							saveImage(card.image, imageDirectory + '/large.jpg', resolve, reject);
						} else {
							console.log('Image already captured for ' + imageDirectory);
							resolve();
						}
					});
				}
			});
		});
	});

	return Promise.all(promiseArray);
})

// grab all controversy card image directories
.then(function () {
	return new Promise(function (resolve, reject) {
		fs.readdir(cardImageDirectory, function (err, files) {
			if (err) {
				reject(err);
			} else {
				resolve(files);
			}
		});
	});
})

// TODO: I already have all of these image pyramids, but when it comes time to generate more,
// I'll need to fix this Promise chain, which includes a synchronous exec()

// .then((directories) => {
// 	console.log('\nSlicing up large-format images into pyramids, one at a time ...\n');

// 	let sliceOps = directories.reduce((promiseChain, directory) => {
// 		return promiseChain.then(() => new Promise((resolve, reject) => {

// 			if (directory !== '.DS_Store') {
// 				fs.readdir(cardImageDirectory + directory, (readdir_err, files) => {
// 					if (readdir_err) {
// 						return Promise.reject(readdir_err);

// 					} else if (!files.includes('pyramid_files')) {
// 						execSync('./magick-slicer.sh ' + cardImageDirectory + directory + '/large.jpg -o ' + cardImageDirectory + directory + '/pyramid',
// 							(error, stdout, stderr) => {

// 							console.log('Slicing ' + directory);

// 							if (error) {
// 								Promise.reject(error);
// 							} else {
// 								console.log(directory + ' successfully sliced.');
// 								resolve();
// 							}
// 						});						
// 					} else {
// 						console.log(directory + ' already sliced.');
// 						resolve();
// 					}
// 				});
// 			}

// 		}));
// 	}, Promise.resolve());

// 	sliceOps.then(() => { return Promise.resolve(); } );
// })

// Grab all controversy card thumbnails from G+ API
.then(function () {
	console.log('\nSaving the controversy card thumbnails ...\n');

	var promiseArray = mongoMetadata.map(function (card) {
		return new Promise(function (resolve, reject) {
			var slug = createSlug(card.name),
			    thumbnailDirectory = cardImageDirectory + slug;

			fs.readdir(thumbnailDirectory, function (readdir_err, files) {
				if (readdir_err) {
					reject(readdir_err);
				} else if (!files.includes('thumbnail.jpg')) {
					console.log('Saving thumbnail ' + thumbnailDirectory + '...');
					saveImage(card.thumbnail, thumbnailDirectory + '/thumbnail.jpg', resolve, reject);
				} else {
					console.log('Thumbnail already captured for ' + thumbnailDirectory);
					resolve();
				}
			});
		});
	});

	return Promise.all(promiseArray);
})

// Grab all feed post image directories based upon local file structure
.then(function () {
	var promiseArray = feedImageDirectories.map(function (feedImageDirectory) {
		return new Promise(function (resolve, reject) {
			fs.readdir(feedImageDirectory, function (err, files) {
				files = files.map(function (file) {
					return feedImageDirectory + file;
				});

				if (err) {
					reject(err);
				} else {
					allFeedImages = allFeedImages.concat(files);
					resolve();
				}
			});
		});
	});

	return Promise.all(promiseArray);
})

// Generate thumbnails for the feed posts
.then(function () {
	console.log('\nGenerating thumbnails from feed posts ...\n');

	allFeedImages = removeSystemFiles(allFeedImages);
	var feedCardCount = 0;

	return new Promise(function (resolve, reject) {
		var syncThumbnail = function syncThumbnail() {
			fs.readdir(allFeedImages[feedCardCount], function (readdir_err, files) {

				if (readdir_err) {
					reject(readdir_err);
				}

				createThumbnail(allFeedImages[feedCardCount], allFeedImages[feedCardCount], files.includes('thumbnail.jpg')).then(function () {

					if (!files.includes('thumbnail.jpg')) {
						console.log('Thumbnail generated for ' + allFeedImages[feedCardCount]);
					}

					if (feedCardCount < allFeedImages.length) {
						syncThumbnail();
					} else {
						resolve();
					}
				}).catch(function (err) {
					reject(err);
				});

				feedCardCount++;
			});
		};

		syncThumbnail();
	});
}).then(function () {
	console.log("\nAll done and no issues.");

	close(db);
}).catch(function (error) {
	console.log("\nAn error has occurred ...");

	if (error) {
		console.log(error);
	}

	close(db);
});