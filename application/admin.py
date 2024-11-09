from django.contrib import admin

# Register your models here.
from .models import *

class ImagesTublerInline(admin.TabularInline):
    model = Product_Image

class ProductAdmin(admin.ModelAdmin):
    inlines = [ImagesTublerInline]

admin.site.register(Company_Furniture)
admin.site.register(Furniture_Categorie)
admin.site.register(Product_Item, ProductAdmin)