# Controversies of Science API / Backend

This is the new backend db and controller for the Controversies of Science API.  The former backend was built on top of Apigee's Usergrid NoSQL.  Through those experiences, I have decided to transition this project to a more production-ready database technology.  Fortunately, there are a number of similarities between Usergrid and MongoDB.

This repo of course assumes that have mongodb set up and running on your local machine.  If you don't, consider using homebrew:

    brew install mongodb

## Controversy Card Data

The controversy card data required to test the Halton Arp controversy prototype at https://github.com/worldviewer/react-worldviewer-prototype will soon be hardcoded into the scrape script.  No further action is currently required to set up the backend.

## Controversy Card Metadata

That said, this will not always be the case.  As the prototype builds out, we'll need access to more than just information about the Halton Arp controversy card.  That means grabbing the metadata for all of the current controversy cards in the Controversies of Science collection.

If the scrape script detects that the Google+ API key environment variables are set, it will populate the mongodb database controversy card metadata from the G+ API.

Access to the G+ API requires an API key from Google.  For more information on how to do that, go here:

    https://developers.google.com/+/web/api/rest/oauth

The scrape script assumes that you have two environmental key variables set, and will only perform the G+ scrape if valid values are provided for these two keys:

    export GPLUS_USER_ID='<a long number>'
    export GPLUS_API_KEY='<a long alphanumeric string>'

These would be set in a file like `.profile` or `.bash_profile` in your root (if you are using a Linux-based machine).

Either way -- with or without metadata -- to set up and populate the Mongodb database, run:

    npm run build
    npm run scrape

This will set up the backend with enough data to use the React frontend at https://github.com/worldviewer/react-worldviewer-prototype.

## State of the Project

I am currently in the midst of porting this backend over.  I'm able to grab the G+ Collection, as before, and have now persisted the card metadata into MongoDB (which provides a high-level view of each controversy card).

The most immediate task is to check that these environment variables are set, and set up mock data to test the frontend with -- just in case user does not want to procure G+ API keys.

## Next Steps

- Create the script to set up the `cards` collection, and populate it with data and overlay images for my prototype Halton Arp card
- Set up Express with routes to return this detailed card data for prototype
- Deploy to AWS
- Refactor w/ Redux

## Data Source

The cards are broken down into 6 categories:

- *ongoing* - Recent, ongoing controversies
- *historical* - Controversies possibly still at play, but more historical in nature
- *person* - Some people you should know about + character studies
- *reform* - Relevant to academic reform and redesigning scientific discourse
- *critique* - The best critical commentary ever published for modern science
- *thinking* - How to think like a scientist about controversies

The data is scraped from my Google Plus collection, here:

*Controversies of Science* - https://plus.google.com/collection/Yhn4Y

