import {
  AmazonPaapiError,
  asinFromAmazonSearchUrl,
  buildMockAmazonProduct,
  extractAsinFromUrl,
  fetchAmazonProductByUrl,
  isbn13ToIsbn10,
  isAmazonSearchUrl,
  resolveAmazonProductUrl,
  signPaapiGetItemsRequest,
} from '../lib/amazon-paapi';

describe('amazon-paapi', () => {
  describe('extractAsinFromUrl', () => {
    it('parses /dp/ASIN URLs', () => {
      expect(
        extractAsinFromUrl('https://www.amazon.com/dp/B0ABCD1234?tag=school-20'),
      ).toBe('B0ABCD1234');
    });

    it('parses Associates product URLs with a title slug and tracking query', () => {
      expect(
        extractAsinFromUrl(
          'https://www.amazon.com/Dimensions-Common-Textbook-Writing-2013-05-04/dp/B01FGMWMUC?dib_tag=se&keywords=Dimensions+Math+Textbook+8B&tag=asa177607-20&ref_=as_li_ss_tl',
        ),
      ).toBe('B01FGMWMUC');
    });

    it('parses /gp/product/ASIN URLs', () => {
      expect(
        extractAsinFromUrl('https://www.amazon.com/gp/product/B08N5WRWNW/ref=xx'),
      ).toBe('B08N5WRWNW');
    });

    it('returns null for non-product URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.com/gp/cart')).toBeNull();
      expect(extractAsinFromUrl('not-a-url')).toBeNull();
    });

    it('returns null for Amazon search URLs', () => {
      expect(
        extractAsinFromUrl(
          'https://www.amazon.com/s?k=Dimensions+Math+Textbook+8B&tag=asa177607-20',
        ),
      ).toBeNull();
    });
  });

  describe('isbn13ToIsbn10', () => {
    it('converts Dimensions Math 5B ISBN-13 to ISBN-10 / ASIN', () => {
      expect(isbn13ToIsbn10('9781947226135')).toBe('1947226134');
    });

    it('rejects 979- ISBN-13', () => {
      expect(isbn13ToIsbn10('9791234567896')).toBeNull();
    });
  });

  describe('asinFromAmazonSearchUrl', () => {
    it('resolves ISBN-13 in Associates search keywords', () => {
      expect(
        asinFromAmazonSearchUrl(
          'https://www.amazon.com/s?k=Dimensions+Math+Textbook+5B+9781947226135&tag=asa177607-20',
        ),
      ).toBe('1947226134');
    });

    it('returns null when search has no ISBN or ASIN', () => {
      expect(
        asinFromAmazonSearchUrl(
          'https://www.amazon.com/s?k=Dimensions+Math+Textbook+8B&tag=asa177607-20',
        ),
      ).toBeNull();
    });
  });

  describe('isAmazonSearchUrl', () => {
    it('detects /s?k= search results', () => {
      expect(
        isAmazonSearchUrl(
          'https://www.amazon.com/s?k=Dimensions+Math+Textbook+8B&tag=asa177607-20',
        ),
      ).toBe(true);
    });

    it('is false for product /dp/ URLs', () => {
      expect(isAmazonSearchUrl('https://www.amazon.com/dp/B0ABCD1234?tag=school-20')).toBe(
        false,
      );
    });
  });

  describe('resolveAmazonProductUrl', () => {
    it('follows short-link redirects within Amazon hosts', async () => {
      const fetchImpl = jest.fn(async () => {
        return {
          status: 301,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'location'
                ? 'https://www.amazon.com/dp/B08SHORT01?tag=x-20'
                : null,
          },
        } as unknown as Response;
      });

      const resolved = await resolveAmazonProductUrl('https://amzn.to/abc123', fetchImpl);
      expect(resolved).toContain('B08SHORT01');
      expect(fetchImpl).toHaveBeenCalled();
    });

    it('rejects redirects off Amazon hosts', async () => {
      const fetchImpl = jest.fn(async () => {
        return {
          status: 302,
          headers: {
            get: () => 'https://evil.example/phish',
          },
        } as unknown as Response;
      });

      await expect(
        resolveAmazonProductUrl('https://amzn.to/bad', fetchImpl),
      ).rejects.toBeInstanceOf(AmazonPaapiError);
    });

    it('does not fetch Amazon HTML for search URLs', async () => {
      const fetchImpl = jest.fn();
      const url =
        'https://www.amazon.com/s?k=Dimensions+Math+Textbook+8B&tag=asa177607-20';
      await expect(resolveAmazonProductUrl(url, fetchImpl)).resolves.toBe(url);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('buildMockAmazonProduct', () => {
    it('returns deterministic preview fields', () => {
      const preview = buildMockAmazonProduct('B08MOCK001', 'https://www.amazon.com/dp/B08MOCK001');
      expect(preview.asin).toBe('B08MOCK001');
      expect(preview.name).toContain('B08MOCK001');
      expect(preview.priceCents).toBe(2499);
      expect(preview.raw).toMatchObject({ mock: true });
    });

    it('uses the Associates ASIN image widget, not /images/I/{ASIN}', () => {
      const preview = buildMockAmazonProduct(
        '1947226126',
        'https://www.amazon.com/s?k=9781947226128&tag=asa177607-20',
      );
      expect(preview.imageUrl).toContain('ws-na.amazon-adsystem.com');
      expect(preview.imageUrl).toContain('ASIN=1947226126');
      expect(preview.imageUrl).toContain('tag=asa177607-20');
      expect(preview.imageUrl).not.toMatch(/images\/I\/1947226126/);
    });
  });

  describe('fetchAmazonProductByUrl', () => {
    it('resolves Associates search URLs that include an ISBN-13', async () => {
      const preview = await fetchAmazonProductByUrl(
        'https://www.amazon.com/s?k=Dimensions+Math+Textbook+5B+9781947226135&tag=asa177607-20',
      );
      expect(preview.asin).toBe('1947226134');
      expect(preview.name).toMatch(/Dimensions Math Textbook 5B/i);
      expect(preview.raw).toMatchObject({ mock: true });
    });

    it('rejects search URLs with no ISBN or ASIN', async () => {
      await expect(
        fetchAmazonProductByUrl(
          'https://www.amazon.com/s?k=Dimensions+Math+Textbook+8B&tag=asa177607-20',
        ),
      ).rejects.toMatchObject({
        name: 'AmazonPaapiError',
        code: 'ASIN_NOT_FOUND',
        message: expect.stringMatching(/ISBN or ASIN/i),
      });
    });
  });

  describe('signPaapiGetItemsRequest', () => {
    it('produces SigV4 authorization header', () => {
      const signed = signPaapiGetItemsRequest({
        accessKey: 'AKIAEXAMPLE',
        secretKey: 'secret',
        host: 'webservices.amazon.com',
        region: 'us-east-1',
        body: '{"PartnerTag":"tag-20"}',
        amzDate: '20260728T120000Z',
        dateStamp: '20260728',
      });
      expect(signed.amzDate).toBe('20260728T120000Z');
      expect(signed.authorization).toContain('AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/');
      expect(signed.authorization).toContain('Signature=');
      expect(signed.target).toContain('GetItems');
    });
  });
});
